import { MigrationInterface, QueryRunner } from 'typeorm';

export class EnforceUniqueAdminRoleAssignments1700000000011 implements MigrationInterface {
  name = 'EnforceUniqueAdminRoleAssignments1700000000011';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE UNIQUE INDEX "uidx_admin_role_assignments_user_role"
        ON "admin_role_assignments" ("userId", "role")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX IF EXISTS "uidx_admin_role_assignments_user_role"`,
    );
  }
}
