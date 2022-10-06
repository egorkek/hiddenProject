import { Controller, Get, Param, Post, Body, Headers, Res, UseGuards } from '@nestjs/common';
import { ServiceError, status } from 'grpc';
import { Deal } from '@vtblife/sbr-api/lib-native/vtblife/sbr/v1/model/model_pb';
import axios from '@vtblife/axios';

import { REQUIRED_ROLE_SCOPES_FOR_READ, REQUIRED_ROLE_SCOPES_FOR_WRITE } from '~/common/constants';
import { DealCheckerSentryHelpers } from './sentry-helpers.service';
import { DealsService } from '../sbr-deal-common/deals.service';
import { assert } from '../../utils/assert';
import { DealStatusChronologicalPosition } from '../../utils/compare-deal-statuses';
import { IDeal, ITask, ITaskDB, ITaskDTO } from '~/common/models/task';
import { IDealsHeaders } from '../../types';
import { FilesService } from './files.service';
import { AuthGuard, Auth } from '../../guards/permission.guard';
import { DealCheckService } from './deal-check.service';
import { TaskService } from './task.service';

@Controller('deal-checker')
@UseGuards(AuthGuard)
export class DealCheckerController {
    constructor(
        private readonly taskService: TaskService,
        private readonly dealsService: DealsService,
        private readonly filesService: FilesService,
        private readonly dealCheckService: DealCheckService,
        private readonly dealCheckerSentryHelpers: DealCheckerSentryHelpers,
    ) {}

    @Get(':id')
    @Auth(REQUIRED_ROLE_SCOPES_FOR_READ, 'EMPLOYEE')
    async getDealTaskList(@Param('id') id: string, @Headers() headers: IDealsHeaders) {
        const authorization = headers.authorization;

        const dealResponse = await this.dealsService.getDeal(id, authorization).catch((error: ServiceError) => {
            if (error?.code === status.NOT_FOUND) {
                assert(false, `Сделка ${id} не найдена`, {
                    status: 404,
                });
            } else {
                assert(false, `Ошибка при попытке загрузить сделку ${id}`, {
                    code: error.code,
                    details: error.details,
                });
            }
        });

        const tasks = await this.taskService.getDealTasks(id);

        const response = {
            id: id,
            status:
                dealResponse.deal?.dealStatus === Deal.DealStatus.REGISTRATION_CONFIRMATION ? 'SUITABLE' : 'INVALID',
            sbr: dealResponse,
            tasks: tasks as ITask[],
            revision: dealResponse.deal?.modifiedAt || '',
        };

        return response;
    }

    @Get(':id/new')
    @Auth(REQUIRED_ROLE_SCOPES_FOR_READ, 'EMPLOYEE')
    async getDeal(@Param('id') id: string, @Headers() headers: IDealsHeaders) {
        const dealId = id;
        const authorization = headers.authorization;

        const dealResponse = await this.dealsService.getDeal(dealId, authorization).catch((error: ServiceError) => {
            if (error?.code === status.NOT_FOUND) {
                assert(false, `Сделка ${id} не найдена`, {
                    status: 404,
                });
            } else {
                assert(false, `Ошибка при попытке загрузить сделку ${id}`, {
                    code: error.code,
                    details: error.details,
                });
            }
        });

        assert(dealResponse?.deal?.dealStatus, 'Не получили статус сделки');
        assert(
            DealStatusChronologicalPosition[dealResponse.deal.dealStatus] >=
                DealStatusChronologicalPosition[Deal.DealStatus.REGISTRATION_CONFIRMATION],
            `Сделка [${dealId}] в некорректном статусе`,
            {
                dealId,
                needStatus: 'REGISTRATION_CONFIRMATION',
                realStatus: dealResponse?.deal?.dealStatus,
            },
        );

        const tasks = await this.taskService.getDealTasks(dealId);

        const { files, rules } = await this.dealCheckService.dealCheck(dealResponse.deal);

        const response: IDeal = {
            id: dealResponse.deal.id || '',
            status: dealResponse.deal.dealStatus === Deal.DealStatus.REGISTRATION_CONFIRMATION ? 'SUITABLE' : 'INVALID',
            sbr: dealResponse,
            tasks: tasks as ITask[],
            revision: dealResponse.deal.modifiedAt || '',
            files: [
                ...files.contractFiles,
                ...files.stampFiles,
                ...files.egrnFiles,
                ...files.familyCapitalDocs,
                ...files.downPaymentDocs,
                ...files.certificateOfAbsenceDocs,
                ...files.acceptanceCertificateDocs,
                ...files.absenceOfArrearsDocs,
                ...files.registrationOfUnderageDocs,
                ...files.allocationOfPartDocs,
            ],
            checks: {
                contract: rules.contractRules.map((rule) => rule.type),
                stamp: rules.stampRules.map((rule) => rule.type),
                egrn: rules.egrnRules.map((rule) => rule.type),
                family_capital: rules.familyCapitalRules.map((rule) => rule.type),
                down_payment: rules.downPaymentRules.map((rule) => rule.type),
                certificate_absence: rules.certificateOfAbsenceRules.map((rule) => rule.type),
                acceptance_certificate: rules.acceptanceCertificateRules.map((rule) => rule.type),
                absence_of_arrears: rules.absenceOfArrearsRules.map((rule) => rule.type),
                registration_of_underage: rules.registrationOfUnderageRules.map((rule) => rule.type),
                allocation_of_part: rules.allocationOfPartRules.map((rule) => rule.type),
            },
        };
        return response;
    }

    @Get(':id/:taskId')
    @Auth(REQUIRED_ROLE_SCOPES_FOR_READ, 'EMPLOYEE')
    async getDealTask(@Param('taskId') taskId: string) {
        const task = await this.taskService.getDealTask(taskId);

        if (!task) {
            assert(false, 'No task');
        }

        const response: ITask = task.toObject();

        return response;
    }

    @Post(':id')
    @Auth(REQUIRED_ROLE_SCOPES_FOR_WRITE, 'EMPLOYEE')
    async postDealTask(@Param('id') id: string, @Body() body: ITaskDTO, @Headers() headers: IDealsHeaders) {
        const authorization = headers.authorization;

        if (body.data.resolution.type === 'ACCEPT') {
            await this.dealsService.accept(authorization, id);
        } else if (body.data.resolution.type === 'REJECT') {
            await this.dealsService.reject(authorization, id, body.data.resolution.comment);
        } else {
            assert(false, 'Не указана резолюция');
        }

        const data: ITaskDB = {
            ...body,
            status: 'DONE',
            dealId: id,
            checkType: 'HUMAN_CHECK',
        };
        const response = await this.taskService.createTask(data);
        this.dealCheckerSentryHelpers.trackHumanTaskCreated(data);

        return response;
    }

    @Get(':dealId/files/:fileId')
    @Auth(REQUIRED_ROLE_SCOPES_FOR_READ, 'EMPLOYEE')
    async getFile(
        @Param('dealId') dealId: string,
        @Param('fileId') fileId: string,
        @Headers() headers: IDealsHeaders,
        @Res() res: any,
    ) {
        const url = await this.filesService.getDownloadUrl({ dealId, fileId, token: headers.authorization || '' });
        const stream = await axios({
            url,
            method: 'GET',
            responseType: 'stream',
        });

        return stream.data.pipe(res);
    }
}
