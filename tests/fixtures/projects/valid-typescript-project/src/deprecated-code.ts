/**
 * Sample deprecated class for testing
 */
export class DeprecatedClass {
    /**
     * @deprecated Use newMethod() instead. This will be removed in v2.0
     */
    public oldMethod(): string {
        return 'deprecated';
    }

    public newMethod(): string {
        return 'new';
    }

    /**
     * @deprecated This property is obsolete
     */
    public oldProperty: string = 'old';
}

export class UserClass {
    private deprecated = new DeprecatedClass();

    public useDeprecatedStuff() {
        // Using deprecated method
        return this.deprecated.oldMethod();
    }
}
