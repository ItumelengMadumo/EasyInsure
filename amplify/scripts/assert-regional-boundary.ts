import { BEDROCK_REGION, DATA_REGION } from '../config/regions.js';

const deploymentRegion = process.env.AWS_REGION ?? process.env.AWS_DEFAULT_REGION;

if (deploymentRegion && deploymentRegion !== DATA_REGION) {
  throw new Error(`Refusing deployment in ${deploymentRegion}. EasyInsure durable resources must deploy in ${DATA_REGION}.`);
}

console.log(`Regional configuration valid: durable data=${DATA_REGION}, Bedrock endpoint=${BEDROCK_REGION} (intentionally independent — Bedrock has no ${DATA_REGION} inference profile for the approved model).`);
