import path from 'path';

import { Module, MiddlewareConsumer } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { ServeStaticModule } from '@nestjs/serve-static';
import { ScheduleModule } from '@nestjs/schedule';
import { HttpRequestsMiddleware, PrometheusModule } from '@vtblife/bff-utils/dist/prometheus/nest';
import { LoggerModule } from '@vtblife/bff-utils/dist/logger/nest';
import { SentryModule } from '@vtblife/bff-utils/dist/sentry';

import { DealCheckerModule } from './modules/sbr-deal-checker/deal-checker.module';
import { config } from '~/bff/config';

@Module({
    imports: [
        ...createInfrastructureModules(),
        MongooseModule.forRoot(config.helpersDB.url, {
            connectionName: config.helpersDB.connectionName,
            useUnifiedTopology: true,
            useNewUrlParser: true,
            useFindAndModify: false,
            autoIndex: false,
        }),
        MongooseModule.forRoot(config.eregDB.url, {
            connectionName: config.eregDB.connectionName,
            useUnifiedTopology: true,
            useNewUrlParser: true,
            useFindAndModify: false,
            autoIndex: false,
        }),
        ServeStaticModule.forRoot({
            serveRoot: '/static',
            rootPath: path.resolve(__dirname, '../../static'),
        }),
        ScheduleModule.forRoot(),
        DealCheckerModule,
    ],
    controllers: [],
    providers: [],
})
export class AppModule {
    configure(consumer: MiddlewareConsumer) {
        consumer.apply(HttpRequestsMiddleware).forRoutes('*');
    }
}

function createInfrastructureModules() {
    return [
        LoggerModule.forRoot({
            serviceName: config.app.serviceName,
            appEnvironment: config.app.environment,
            prettyPrint: false,
        }),
        SentryModule.forRoot({
            dsn: config.app.dsn,
            environment: config.app.environment,
            release: config.app.version,
            enabled: Boolean(config.app.dsn),
        }),
        PrometheusModule.forRoot({
            serviceName: config.app.serviceName,
            serviceVersion: config.app.version,
            appEnvironment: config.app.environment,
            disablePathLabel: true,
        }),
    ];
}
