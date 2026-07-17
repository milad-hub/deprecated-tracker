import {
  Api,
  Callable,
  Child,
  CurrentEnum,
  Dictionary,
  Factory,
  Implementation,
  Legacy,
  OldEnum,
  OldNamespace,
  OldType,
  oldArrow,
  oldFunction,
  oldValue,
} from "../../library/src/api";
import { AmbientApi } from "../../library/src/ambient";

export class Component {
  public constructor(private readonly api: Api) {}

  public run(): void {
    this.api.oldMethod();
    void this.api.oldProperty;
    void this.api.oldAccessor;
    this.api.oldSetting = "old";
    this.api.oldCustom();
    this.api["oldComputed"]();

    const { oldMethod: alias } = this.api;
    alias();

    const object = {
      /** @deprecated Use object.current instead */
      oldObjectMethod(): void {},
    };
    object.oldObjectMethod();
  }
}

const typeValue: OldType = "old";
void typeValue;
OldEnum.Value;
CurrentEnum.OldMember;
OldNamespace.value;
oldFunction();
oldArrow();
void oldValue;
new Legacy();

const callable = null as unknown as Callable;
callable();
const factory = null as unknown as Factory;
new factory();
const dictionary = null as unknown as Dictionary;
dictionary["key"];
const ambient = null as unknown as AmbientApi;
ambient.oldAmbient();

new Implementation().oldInterfaceMethod();
new Child().oldBaseMethod();
