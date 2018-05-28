import { StringChildValidator } from 'better-validator/src/IsObject';

export namespace Shared {

  export function checkAccessOneParams(params: StringChildValidator, parentIds?: string[]): void {
    if (parentIds) {
      parentIds.forEach((id) => {
        params(id).required().notEmpty();
      });
    }
    params('id').required().notEmpty();
  }

  export function checkAccessManyParams(params: StringChildValidator, parentIds?: string[]): void {
    if (parentIds) {
      parentIds.forEach((id) => {
        params(id).required().notEmpty();
      });
    }
    params().strict();
  }
}
