export type KafkaFieldType<ValueType extends Record<string, any> = Record<string, any>> =
    | Buffer
    | ValueType
    | string
    | null;

export interface KafkaMessage<ValueType extends Record<string, any>> {
    topic: string;
    partition?: number;
    offset: string;
    timestamp: string;
    key?: KafkaFieldType;
    value: KafkaFieldType<ValueType>;
    headers: {
        [key: string]: KafkaFieldType | undefined;
    };
}

export interface KafkaMessageContext {
    requestService?: string;
}

export interface KafkaReply<ValueType> {
    topic?: string;
    key?: KafkaFieldType;
    value: ValueType;
    headers?: {
        [key: string]: KafkaFieldType | undefined;
    };
}
