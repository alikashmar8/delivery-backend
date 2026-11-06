import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Region } from './entities/region.entity';
import { PaginationQueryDto } from '../../common/dto/pagination.dto';

@Injectable()
export class RegionsService {
  constructor(
    @InjectRepository(Region) private readonly repo: Repository<Region>,
  ) {}

  async findAll(
    countryCode: string,
    page: PaginationQueryDto,
  ): Promise<Region[]> {
    return await this.repo.find({
      where: { countryCode },
      order: { type: 'ASC', name: 'ASC', id: 'ASC' },
      take: page.take,
      skip: page.skip,
    });
  }

  async findChildren(
    parentId: string,
    page: PaginationQueryDto,
  ): Promise<Region[]> {
    return await this.repo.find({
      where: { parentId },
      order: { name: 'ASC', id: 'ASC' },
      take: page.take,
      skip: page.skip,
    });
  }

  async findById(id: string): Promise<Region | null> {
    return await this.repo.findOne({ where: { id } });
  }
}
