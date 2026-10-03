import {
  CanActivate,
  ExecutionContext,
  Inject,
  Injectable,
  SetMetadata,
} from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { can, type AuthUser, type Permission } from "@so7ob/contracts";
import { AuthFault } from "@so7ob/server";
import { AccountGuard } from "./controller.js";
export const RequiresPermission = (permission: Permission) =>
  SetMetadata("so7ob.permission", permission);
@Injectable()
export class PermissionGuard implements CanActivate {
  constructor(
    @Inject(AccountGuard) private readonly account: AccountGuard,
    @Inject(Reflector) private readonly reflector: Reflector,
  ) {}
  async canActivate(context: ExecutionContext) {
    await this.account.canActivate(context);
    const permission = this.reflector.getAllAndOverride<Permission>(
      "so7ob.permission",
      [context.getHandler(), context.getClass()],
    );
    const req = context.switchToHttp().getRequest<{ actor: AuthUser }>();
    if (!permission || !can(req.actor, permission))
      throw new AuthFault(403, "forbidden");
    return true;
  }
}
