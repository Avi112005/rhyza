export interface Event {
  type: string;
  data: Record<string, unknown>;
}

interface EventPublisherAdapter {
  publish(events: Event[]): Promise<void>;
}

export class EventPublisher implements EventPublisherAdapter {
  public async publish(events: Event[]): Promise<void> {
    // not implemented
  }
}
