import { Observable } from 'rxjs';

export class TestClass {
  /**
   * @deprecated This method is deprecated, use newMethod instead
   */
  public oldMethod(): void {
    console.log('This is deprecated');
  }

  public newMethod(): void {
    console.log('This is the new method');
  }

  public testObservable(): void {
    // This should NOT be flagged as deprecated
    const obs = new Observable(subscriber => {
      subscriber.next('test');
      subscriber.complete();
    });
    
    // This subscribe method should NOT be flagged as deprecated
    obs.subscribe(value => console.log(value));
  }

  public testDeprecatedObservable(): void {
    // Test with deprecated observable methods if available
    const obs = new Observable(subscriber => {
      subscriber.next('test');
    });
    
    // This should also not be flagged unless it's actually deprecated
    obs.subscribe({
      next: value => console.log(value),
      error: err => console.error(err),
      complete: () => console.log('complete')
    });
  }
}