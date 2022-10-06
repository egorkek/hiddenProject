import fs from 'fs';

import { MicroserviceOptions, Transport } from '@nestjs/microservices';
import { NestFactory } from '@nestjs/core';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import cookieParser from 'cookie-parser';
import { json as bodyParserJson } from 'body-parser';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';

import { NestExpressApplication } from '@nestjs/platform-express';
import { setupKeepAliveTimeout } from '@vtblife/bff-utils/dist/common';
import { getJaegerTracer, NestTracingInterceptor } from '@vtblife/bff-utils/dist/tracing';
import { createNamespace } from 'cls-hooked';
import { SimpleStdErrLogger, NestLogger } from '@vtblife/bff-utils/dist/logger/nest';
import { SentryInterceptor } from '@vtblife/bff-utils/dist/sentry/nest';
import cors from 'cors';
import { dump } from 'js-yaml';

import { namespaceMiddleware } from './middlewares/namespace-middleware';
import { config } from './config';
import { AppModule } from './app.module';
import { authorizationMiddleware } from './middlewares/authorization-middleware';
import { initContextMiddleware } from './middlewares/init-context-middleware';
import { ElregDocParserModule } from './modules/elreg-doc-parser/elreg-doc-parser.module';
import { SbrDealDocParserModule } from './modules/sbr-deal-doc-parser/sbr-deal-doc-parser.module';

const rootNamespace = createNamespace(config.app.serviceName);
const tracer = getJaegerTracer(
    {
        serviceName: `${config.app.serviceName}-${config.app.environment}`,
        reporter: { agentHost: config.app.agentHost, agentPort: Number(config.app.agentPort) },
    },
    {},
);

const setupApp = (app: INestApplication) => {
    setupKeepAliveTimeout(app.getHttpServer());

    app.useLogger(app.get(NestLogger));
    /*
        Инитит контекст внутри реквеста, поэтому нельзя ставить мидлвари, которые им управляют до этой
        иначе изменения контекста перезатрутся
    */
    app.use(initContextMiddleware);
    app.use(namespaceMiddleware(rootNamespace));
    app.use(cookieParser());
    app.use(bodyParserJson({ limit: '100mb' }));
    app.useGlobalInterceptors(new SentryInterceptor(), new NestTracingInterceptor(rootNamespace, tracer));
    app.use(authorizationMiddleware);

    // Валидация DTO
    // https://docs.nestjs.com/techniques/validation
    app.useGlobalPipes(new ValidationPipe());

    if (config.app.environment === 'local') {
        app.use(cors({ origin: true, credentials: true }));
    }
};

async function setupKafkaMicroservice(app: INestApplication, opts: { brokers: string[] }) {
    // Add Kafka microservice
    app.connectMicroservice<MicroserviceOptions>({
        transport: Transport.KAFKA,
        options: {
            client: {
                clientId: 'helpers-bff',
                brokers: opts.brokers,
                retry: {
                    retries: 50,
                },
            },
            consumer: {
                groupId: 'helpers-bff',
            },
        },
    });
    await app.startAllMicroservicesAsync();
}

async function bootstrap() {
    const app = await NestFactory.create<NestExpressApplication>(AppModule, { logger: new SimpleStdErrLogger() });
    setupApp(app);
    const logger = app.get(NestLogger);

    if (config.app.kafkaEnabled) {
        if (config.app.kafkaBrokers) {
            const brokers = config.app.kafkaBrokers.split(',');
            await setupKafkaMicroservice(app, { brokers });
        } else {
            logger.warn('KAFKA_BROKERS variable is not set. Kafka microservice will not be connected!');
        }
    }

    await app.listen(config.app.port);
    if (config.app.environment === 'local') {
        logger.log(`Listening on http://localhost:${config.app.port}`);
    }

    if (config.app.environment === 'local') {
        const options = new DocumentBuilder()
            .setTitle(config.app.serviceName)
            .setDescription(config.app.serviceName)
            .setVersion(config.app.serviceName)
            .build();

        const document = SwaggerModule.createDocument(app, options, {
            include: [ElregDocParserModule, SbrDealDocParserModule],
        });

        SwaggerModule.setup('api', app, document);

        fs.writeFileSync('./openapi.json', JSON.stringify(document, null, 4) + '\n');
        fs.writeFileSync('./swagger-spec.yml', dump(document));
    }
}
bootstrap();
