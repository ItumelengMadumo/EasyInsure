import { defineBackend } from '@aws-amplify/backend';
import { Duration, RemovalPolicy, Stack, Token } from 'aws-cdk-lib';
import { Alarm, ComparisonOperator, Metric, TreatMissingData } from 'aws-cdk-lib/aws-cloudwatch';
import { PolicyStatement } from 'aws-cdk-lib/aws-iam';
import { CfnBucket } from 'aws-cdk-lib/aws-s3';
import { Function as LambdaFunction } from 'aws-cdk-lib/aws-lambda';
import { Queue, QueueEncryption } from 'aws-cdk-lib/aws-sqs';
import { LogGroup, RetentionDays } from 'aws-cdk-lib/aws-logs';
import { DefinitionBody, Fail, JsonPath, LogLevel, StateMachine, StateMachineType, TaskInput } from 'aws-cdk-lib/aws-stepfunctions';
import { LambdaInvoke, SqsSendMessage } from 'aws-cdk-lib/aws-stepfunctions-tasks';
import { auth } from './auth/resource';
import { data } from './data/resource';
import { insuranceEngine } from './functions/insurance-engine/resource';
import { claimsCommand } from './functions/claims-command/resource';
import { postConfirmation } from './functions/post-confirmation/resource';
import { claimsCopilot } from './functions/claims-copilot/resource';
import { processClaim } from './functions/process-claim/resource';
import { storage } from './storage/resource';
import {
  BEDROCK_FOUNDATION_MODEL_ID,
  BEDROCK_INFERENCE_PROFILE_ID,
  BEDROCK_PROFILE_DESTINATION_REGIONS,
  BEDROCK_REGION,
  DATA_REGION,
} from './config/regions';

const backend = defineBackend({ auth, data, storage, insuranceEngine, claimsCommand, postConfirmation, claimsCopilot, processClaim });
const stack = Stack.of(backend.insuranceEngine.resources.lambda);

if (!Token.isUnresolved(stack.region) && stack.region !== DATA_REGION) {
  throw new Error(`EasyInsure durable resources must deploy in ${DATA_REGION}, not ${stack.region}`);
}

backend.auth.resources.userPool.grant(
  backend.postConfirmation.resources.lambda,
  'cognito-idp:AdminAddUserToGroup',
);

// A DLQ is provisioned now and consumed by the processing state machine introduced
// with the workflow handlers. Retention gives operators time to replay safely.
const claimsDlq = new Queue(stack, 'ClaimsDeadLetterQueue', {
  encryption: QueueEncryption.KMS_MANAGED,
  retentionPeriod: Duration.days(14),
});
claimsDlq.applyRemovalPolicy(RemovalPolicy.RETAIN);

const stage = (id: string, stageName: string) => new LambdaInvoke(stack, id, {
  lambdaFunction: backend.processClaim.resources.lambda,
  payload: TaskInput.fromObject({ stage: stageName, state: JsonPath.objectAt('$') }),
  payloadResponseOnly: true,
}).addRetry({ errors: ['Lambda.ServiceException', 'Lambda.AWSLambdaException', 'Lambda.SdkClientException'], interval: Duration.seconds(2), backoffRate: 2, maxAttempts: 3 });

const validate = stage('ValidateClaim', 'validate');
const calculate = stage('RunDeterministicEngines', 'calculate');
const copilot = stage('GenerateCopilotAnalysis', 'copilot');
const persist = stage('PersistForHumanReview', 'persist');
const recordFailure = new LambdaInvoke(stack, 'RecordWorkflowFailure', {
  lambdaFunction: backend.processClaim.resources.lambda,
  payload: TaskInput.fromObject({ stage: 'failure', state: JsonPath.objectAt('$'), workflowError: JsonPath.objectAt('$.workflowError') }),
  payloadResponseOnly: true,
});
const deadLetter = new SqsSendMessage(stack, 'SendToDeadLetterQueue', {
  queue: claimsDlq,
  messageBody: TaskInput.fromJsonPathAt('$'),
});
const failed = new Fail(stack, 'ProcessingFailed', { cause: 'Claim processing exhausted retries' });
for (const task of [validate, calculate, copilot, persist]) task.addCatch(recordFailure, { resultPath: '$.workflowError' });

const workflowLogs = new LogGroup(stack, 'ClaimsWorkflowLogs', { retention: RetentionDays.ONE_MONTH, removalPolicy: RemovalPolicy.RETAIN });
const claimsWorkflow = new StateMachine(stack, 'ClaimsWorkflow', {
  definitionBody: DefinitionBody.fromChainable(validate.next(calculate).next(copilot).next(persist)),
  stateMachineType: StateMachineType.STANDARD,
  timeout: Duration.minutes(10),
  logs: { destination: workflowLogs, level: LogLevel.ERROR, includeExecutionData: false },
  tracingEnabled: true,
});
recordFailure.next(deadLetter).next(failed);

backend.insuranceEngine.resources.lambda.grantInvoke(backend.processClaim.resources.lambda);
backend.claimsCopilot.resources.lambda.grantInvoke(backend.processClaim.resources.lambda);
(backend.processClaim.resources.lambda as LambdaFunction).addEnvironment('INSURANCE_ENGINE_FUNCTION_NAME', backend.insuranceEngine.resources.lambda.functionName);
(backend.processClaim.resources.lambda as LambdaFunction).addEnvironment('CLAIMS_COPILOT_FUNCTION_NAME', backend.claimsCopilot.resources.lambda.functionName);
claimsWorkflow.grantStartExecution(backend.claimsCommand.resources.lambda);
(backend.claimsCommand.resources.lambda as LambdaFunction).addEnvironment('CLAIMS_STATE_MACHINE_ARN', claimsWorkflow.stateMachineArn);

backend.insuranceEngine.resources.lambda.addToRolePolicy(new PolicyStatement({
  actions: ['cloudwatch:PutMetricData'],
  resources: ['*'],
  conditions: { StringEquals: { 'cloudwatch:namespace': 'EasyInsure' } },
}));

const inferenceProfileArn = stack.formatArn({
  service: 'bedrock', region: BEDROCK_REGION, account: stack.account,
  resource: 'inference-profile', resourceName: BEDROCK_INFERENCE_PROFILE_ID,
});
backend.claimsCopilot.resources.lambda.addToRolePolicy(new PolicyStatement({
  actions: ['bedrock:InvokeModel'],
  resources: [inferenceProfileArn],
}));
backend.claimsCopilot.resources.lambda.addToRolePolicy(new PolicyStatement({
  actions: ['bedrock:InvokeModel'],
  resources: BEDROCK_PROFILE_DESTINATION_REGIONS.map((region) => stack.formatArn({
    service: 'bedrock', region, account: '', resource: 'foundation-model',
    resourceName: BEDROCK_FOUNDATION_MODEL_ID,
  })),
  conditions: { StringEquals: { 'bedrock:InferenceProfileArn': inferenceProfileArn } },
}));

new Alarm(stack, 'InsuranceEngineErrors', {
  metric: backend.insuranceEngine.resources.lambda.metricErrors({ period: Duration.minutes(5) }),
  threshold: 1,
  evaluationPeriods: 1,
  comparisonOperator: ComparisonOperator.GREATER_THAN_OR_EQUAL_TO_THRESHOLD,
  treatMissingData: TreatMissingData.NOT_BREACHING,
});

new Alarm(stack, 'ClaimsDeadLetterMessages', {
  metric: new Metric({
    namespace: 'AWS/SQS', metricName: 'ApproximateNumberOfMessagesVisible',
    dimensionsMap: { QueueName: claimsDlq.queueName }, period: Duration.minutes(5), statistic: 'Maximum',
  }),
  threshold: 1,
  evaluationPeriods: 1,
  treatMissingData: TreatMissingData.NOT_BREACHING,
});

const bucket = backend.storage.resources.bucket;
const cfnBucket = bucket.node.defaultChild as CfnBucket;
cfnBucket.versioningConfiguration = { status: 'Enabled' };
cfnBucket.replicationConfiguration = undefined;
cfnBucket.lifecycleConfiguration = {
  rules: [{ id: 'expire-quarantine', status: 'Enabled', prefix: 'quarantine/', expirationInDays: 7 }],
};

backend.addOutput({
  custom: {
    awsRegion: stack.region,
    durableDataRegion: DATA_REGION,
    bedrockInferenceRegion: BEDROCK_REGION,
    claimsDeadLetterQueueUrl: claimsDlq.queueUrl,
  },
});
