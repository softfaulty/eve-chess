import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class EnginesService {
  constructor(private readonly prisma: PrismaService) {}

  findAll() {
    return this.prisma.engine.findMany({
      orderBy: {
        createdAt: 'asc',
      },
    });
  }
}
