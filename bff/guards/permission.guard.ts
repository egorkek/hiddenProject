import { Injectable, CanActivate, ExecutionContext, SetMetadata } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';

export const Auth = (permissions: string[], role?: string) => SetMetadata('auth', { permissions, role });

@Injectable()
export class AuthGuard implements CanActivate {
    constructor(private reflector: Reflector) {}

    canActivate(context: ExecutionContext): boolean {
        const { permissions, role } = this.reflector.get<{ permissions: string[]; role?: string }>(
            'auth',
            context.getHandler(),
        );

        const req = context.switchToHttp().getRequest<Request>();

        // В тестах не используются мидлвари и context не выставляется,
        // поэтому не верим типам и используем optional chaining
        // TODO: Сделать более честные тесты
        const auth = req?.context?.auth;

        if (!auth) {
            return false;
        }

        const havePermissions = permissions.every((permission) => auth.permissions.includes(permission));
        const haveRole = role ? auth.role === role : true;

        return havePermissions && haveRole;
    }
}
