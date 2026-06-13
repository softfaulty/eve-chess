import {
  OnGatewayConnection,
  OnGatewayDisconnect,
  WebSocketGateway,
} from '@nestjs/websockets';
import { Socket } from 'socket.io';
import { MatchService } from './match.service';

@WebSocketGateway({
  cors: {
    origin: 'http://localhost:5173',
  },
})
export class MatchGateway implements OnGatewayConnection, OnGatewayDisconnect {
  private unsubs = new Map<string, () => void>();

  constructor(private readonly matchService: MatchService) {}

  handleConnection(client: Socket) {
    this.unsubs.set(
      client.id,
      this.matchService.subscribe((state) => {
        client.emit('match/state', state);
      }),
    );
  }

  handleDisconnect(client: Socket) {
    this.unsubs.get(client.id)?.();
    this.unsubs.delete(client.id);
  }
}
