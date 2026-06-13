import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class GamesService {
  constructor(private readonly prisma: PrismaService) {}

  findAll() {
    return this.prisma.game.findMany({
      include: {
        blackEngine: true,
        whiteEngine: true,
      },
      orderBy: {
        startedAt: 'desc',
      },
      take: 20,
    });
  }

  findOne(id: string) {
    return this.prisma.game.findUnique({
      where: { id },
      include: {
        blackEngine: true,
        moves: {
          orderBy: {
            ply: 'asc',
          },
        },
        whiteEngine: true,
      },
    });
  }
}
