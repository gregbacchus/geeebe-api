import { StringChildValidator } from 'better-validator/src/IsObject';

export namespace Shared {

  export function checkAccessOneParams(params: StringChildValidator): void {
    params('id').required().lengthInRange(1);
  }

  export function checkAccessManyParams(params: StringChildValidator): void {
    params().strict();
  }
}
