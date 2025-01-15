interface EventPublisherAdapter<T> {
  publish(events: T[]): Promise<void>;
}

export class EventPublisher<T> implements EventPublisherAdapter<T> {
  private events: T[] = [];

  public async publish(events: T[]): Promise<void> {
    this.events = this.events.concat(events);
  }
}
