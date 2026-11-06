import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { User } from '../../users/entities/user.entity';

export interface AuthenticatedUser {
  sub: string;
  user: User;
}

export const CurrentUser = createParamDecorator(
  (data: string | undefined, ctx: ExecutionContext) => {
    const request = ctx.switchToHttp().getRequest();
    const authUser: AuthenticatedUser = request.user;

    if (!authUser) {
      return null;
    }

    // @CurrentUser() → returns the full user object
    // @CurrentUser('sub') → returns just the user ID
    return data ? authUser[data as keyof AuthenticatedUser] : authUser.user;
  },
);
