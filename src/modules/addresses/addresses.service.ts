import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { IsNull, Repository } from 'typeorm';
import { CreateAddressDto } from './dto/address.dto';
import { UpdateAddressDto } from './dto/address.dto';
import { PaginationQueryDto } from '../../common/dto/pagination.dto';
import { Address } from './entities/address.entity';

@Injectable()
export class AddressesService {
  constructor(
    @InjectRepository(Address) private readonly repo: Repository<Address>,
  ) {}

  async create(userId: string, dto: CreateAddressDto): Promise<Address> {
    const entity = this.repo.create({
      ...dto,
      userId,
      regionId: dto.regionId ?? null,
    });
    return await this.repo.save(entity);
  }

  async findMine(userId: string, page: PaginationQueryDto): Promise<Address[]> {
    return await this.repo.find({
      where: { userId, deletedAt: IsNull() },
      order: { createdAt: 'DESC', id: 'DESC' },
      take: page.take,
      skip: page.skip,
    });
  }

  async findOne(id: string, userId: string): Promise<Address> {
    const addr = await this.repo.findOne({
      where: { id, deletedAt: IsNull() },
    });
    if (!addr) throw new NotFoundException('Address not found');
    if (addr.userId !== userId)
      throw new ForbiddenException('Not your address');
    return addr;
  }

  async update(
    id: string,
    userId: string,
    dto: UpdateAddressDto,
  ): Promise<Address> {
    const addr = await this.findOne(id, userId);
    Object.assign(addr, dto);
    return await this.repo.save(addr);
  }

  async remove(id: string, userId: string): Promise<void> {
    const addr = await this.findOne(id, userId);
    await this.repo.softRemove(addr);
  }
}
