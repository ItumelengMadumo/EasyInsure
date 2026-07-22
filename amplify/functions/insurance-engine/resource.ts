import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineFunction } from '@aws-amplify/backend';
import { DockerImage, Duration } from 'aws-cdk-lib';
import { Architecture, Code, Function, Runtime } from 'aws-cdk-lib/aws-lambda';

const functionDir = path.dirname(fileURLToPath(import.meta.url));

export const insuranceEngine = defineFunction(
  (scope) => new Function(scope, 'insurance-engine', {
    architecture: Architecture.ARM_64,
    code: Code.fromAsset(functionDir, {
      bundling: {
        image: DockerImage.fromRegistry('public.ecr.aws/sam/build-python3.12:latest-arm64'),
        local: {
          tryBundle(outputDir: string) {
            fs.cpSync(functionDir, outputDir, {
              recursive: true,
              filter: (source: string) => !source.endsWith('resource.ts') && !source.includes('__pycache__'),
            });
            // The engine intentionally uses only Python's standard library, so
            // branch deployments do not need Docker or pip to package it.
            return true;
          },
        },
      },
    }),
    description: 'Dependency-free deterministic EasyInsure calculations',
    handler: 'handler.handler',
    memorySize: 256,
    runtime: Runtime.PYTHON_3_12,
    timeout: Duration.seconds(20),
  }),
  { resourceGroupName: 'data' },
);
