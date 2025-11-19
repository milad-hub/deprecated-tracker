"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.TestDeprecated = exports.TestRxJSSubscribe = void 0;
const rxjs_1 = require("rxjs");
// Test to see if subscribe method gets flagged as deprecated
class TestRxJSSubscribe {
    testObservable() {
        const obs = new rxjs_1.Observable(subscriber => {
            subscriber.next('test');
            subscriber.complete();
        });
        // This subscribe method should NOT be flagged as deprecated
        obs.subscribe(value => console.log(value));
    }
}
exports.TestRxJSSubscribe = TestRxJSSubscribe;
// Also test a clearly deprecated method
class TestDeprecated {
    /**
     * @deprecated This method is deprecated, use newMethod instead
     */
    oldMethod() {
        console.log('This is deprecated');
    }
    testDeprecated() {
        this.oldMethod(); // This should be flagged as deprecated
    }
}
exports.TestDeprecated = TestDeprecated;
//# sourceMappingURL=test-rxjs.js.map