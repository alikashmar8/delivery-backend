import { MigrationInterface, QueryRunner } from 'typeorm';
import { lebanonSeed } from '../../modules/regions/seed/lebanon-regions.seed';

export class SeedLebanonRegions1700000000004 implements MigrationInterface {
  name = 'SeedLebanonRegions1700000000004';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const codeToId = new Map<string, string>();
    for (const r of lebanonSeed) {
      let parentId: string | null = null;
      if (r.parentCode) parentId = codeToId.get(r.parentCode) ?? null;
      const result: Array<{ id: string }> = await queryRunner.query(
        `INSERT INTO "regions" ("type","code","name","parent_id","country_code") VALUES ($1,$2,$3,$4,'LB') RETURNING "id"`,
        [r.type, r.code, r.name, parentId],
      );
      codeToId.set(r.code, result[0].id);
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    for (const r of [...lebanonSeed].reverse()) {
      await queryRunner.query(`DELETE FROM "regions" WHERE "code" = $1 AND "country_code" = 'LB'`, [r.code]);
    }
  }
}
