export interface Event {
  type: string;
  data: Record<string, unknown>;
}

interface EventPublisherAdapter {
  publish(events: Event[]): Promise<void>;
}

export class EventPublisher implements EventPublisherAdapter {
  public async publish(events: Event[]): Promise<void> {
    for (const event of events) {
      console.log(`Publishing ${event.type}`);
      console.dir(event.data, { depth: null });
    }
  }
}
