import EventEmitter from "events";

export interface Event {
  type: string;
  data: Record<string, unknown>;
}

interface EventPublisherAdapter {
  publish(events: Event[]): Promise<void>;
}

export class EventPublisher implements EventPublisherAdapter {
  private eventEmitter = new EventEmitter();

  public async publish(events: Event[]): Promise<void> {
    for (const event of events) {
      this.eventEmitter.emit(event.type, event);
    }
  }

  public registerConsumer(
    type: string,
    consumer: (...args: any[]) => Promise<void>
  ) {
    this.eventEmitter.addListener(type, async (event) => consumer(event));
  }
}
