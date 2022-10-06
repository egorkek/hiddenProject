import envalid, { port, url, str } from 'envalid';

// FYI: envalid сам добавляет переменные из .env в process.env

const env = envalid.cleanEnv(process.env, {
    LISTEN_PORT: port(),
    SBR_GRPC_API_URL: url(),
    SBR_REST_API_URL: url(),
    DOCUMENT_STORAGE_GRPC_API_URL: url(),
    DOCUMENT_STORAGE_UPLOAD_URL: url(),
    DOCUMENT_RECOGNITION_API_URL: url(),
    JWKS_ENDPOINT: url(),
    APP_ENVIRONMENT: str({ choices: ['local', 'development', 'test', 'stage', 'production'] }),
    HELPERS_DB_USER: str(),
    // две переменные тк одна для локального запуска (HELPERS_DB_PASS),
    // а вторая (HELPERS_MONGO_PASSWORD) для старта в кубере, эта переменная прилетает в под с секретом из вольта
    HELPERS_DB_PASS: str(),
    HELPERS_MONGO_PASSWORD: str({ default: '' }),
    HELPERS_DB_HOST: url(),
    HELPERS_DB_AUTH_SOURCE: str(),
    HELPERS_DB_NAME: str(),
    EREG_DB_USER: str(),
    // две переменные тк одна для локального запуска (EREG_DB_PASS),
    // а вторая (EREG_MONGO_PASSWORD) для старта в кубере, эта переменная прилетает в под с секретом из вольта
    EREG_DB_PASS: str(),
    EREG_MONGO_PASSWORD: str({ default: '' }),
    EREG_DB_HOST: url(),
    EREG_DB_AUTH_SOURCE: str(),
    EREG_DB_NAME: str(),
    APP_VERSION: str(),
    APP_REF_SHA: str(),
});

const enc = (str: string | undefined) => encodeURIComponent(str || '');

export const config = {
    app: {
        serviceName: 'helpers-bff',
        version: [env.APP_VERSION, env.APP_REF_SHA].filter(Boolean).join(':'),
        port: env.LISTEN_PORT,
        environment: env.APP_ENVIRONMENT,
        jwksUrl: env.JWKS_ENDPOINT,
        agentHost: env.CONFIG_HOST,
        agentPort: env.CONFIG_PORT,
        dsn: env.SENTRY_DSN,
        kafkaEnabled: env.KAFKA_ENABLED === 'true',
        kafkaBrokers: env.KAFKA_BROKERS,
        cronEnabled: env.IS_CRON_POD === 'true' || env.CRON_ENABLED === 'true',
    },
    helpersDB: {
        connectionName: 'helpers',
        user: env.HELPERS_DB_USER,
        pass: env.HELPERS_DB_PASS,
        host: env.HELPERS_DB_HOST,
        authSource: env.HELPERS_DB_AUTH_SOURCE,
        name: env.HELPERS_DB_NAME,
        url: `mongodb://${enc(env.HELPERS_DB_USER)}:${enc(env.HELPERS_MONGO_PASSWORD || env.HELPERS_DB_PASS)}@${
            env.HELPERS_DB_HOST
        }/${env.HELPERS_DB_NAME}?authSource=${env.HELPERS_DB_AUTH_SOURCE}`,
    },
    eregDB: {
        connectionName: 'eregistration',
        user: env.EREG_DB_USER,
        pass: env.EREG_DB_PASS || env.EREG_DB_PASS_LOCAL,
        host: env.EREG_DB_HOST,
        authSource: env.EREG_DB_AUTH_SOURCE,
        name: env.EREG_DB_NAME,
        url: `mongodb://${enc(env.EREG_DB_USER)}:${enc(env.EREG_MONGO_PASSWORD || env.EREG_DB_PASS)}@${
            env.EREG_DB_HOST
        }/${env.EREG_DB_NAME}?authSource=${env.EREG_DB_AUTH_SOURCE}`,
    },
    sbr: {
        restApiUrl: env.SBR_REST_API_URL,
        grpcApiUrl: env.SBR_GRPC_API_URL,
        grpcApiSsl: env.SBR_GRPC_API_URL.endsWith('443'),
    },
    documentStorage: {
        grpcApiUrl: env.DOCUMENT_STORAGE_GRPC_API_URL,
        grpcApiSsl: env.DOCUMENT_STORAGE_GRPC_API_URL.endsWith('443'),
        uploadApiUrl: env.DOCUMENT_STORAGE_UPLOAD_URL,
    },
    documentRecognition: {
        apiUrl: env.DOCUMENT_RECOGNITION_API_URL,
    },
};
