import { Observable } from 'rxjs';

// Test to see if subscribe method gets flagged as deprecated
export class TestRxJSSubscribe {
  public testObservable(): void {
    const obs = new Observable(subscriber => {
      subscriber.next('test');
      subscriber.complete();
    });
    
    // This subscribe method should NOT be flagged as deprecated
    obs.subscribe(value => console.log(value));
  }
}

// Also test a clearly deprecated method
export class TestDeprecated {
  /**
   * @deprecated This method is deprecated, use newMethod instead
   */
  public oldMethod(): void {
    console.log('This is deprecated');
  }
  
  public testDeprecated(): void {
    this.oldMethod(); // This should be flagged as deprecated
  }
}