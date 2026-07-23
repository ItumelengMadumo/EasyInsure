import { BEDROCK_REGION, DATA_REGION } from '../config/regions.js';

const deploymentRegion = process.env.AWS_REGION ?? process.env.AWS_DEFAULT_REGION;

if (deploymentRegion && deploymentRegion !== DATA_REGION) {
  throw new Error(`Refusing deployment in ${deploymentRegion}. EasyInsure durable resources must deploy in ${DATA_REGION}.`);
}

if (BEDROCK_REGION !== DATA_REGION) {
  throw new Error(`EasyInsure requires a single primary region; data=${DATA_REGION}, Bedrock endpoint=${BEDROCK_REGION}.`);
}

console.log(`Regional configuration valid: application data and Bedrock endpoint=${DATA_REGION}`);
