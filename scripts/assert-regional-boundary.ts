import { BEDROCK_REGION, DATA_REGION } from '../amplify/config/regions.js';

const deploymentRegion = process.env.AWS_REGION ?? process.env.AWS_DEFAULT_REGION;

if (deploymentRegion && deploymentRegion !== DATA_REGION) {
  throw new Error(`Refusing deployment in ${deploymentRegion}. EasyInsure durable resources must deploy in ${DATA_REGION}.`);
}

if (BEDROCK_REGION === DATA_REGION) {
  throw new Error('Bedrock processing and durable-data regions must remain explicitly distinct for this architecture.');
}

console.log(`Regional boundary valid: durable data=${DATA_REGION}, Bedrock inference=${BEDROCK_REGION}`);
