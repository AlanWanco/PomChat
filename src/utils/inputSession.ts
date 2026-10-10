let numericEditor: HTMLInputElement | null = null;
export const isNumberEditing = () => numericEditor !== null;
export const beginNumberEdit = (input: HTMLInputElement | null) => { numericEditor = input; };
export const endNumberEdit = () => { numericEditor = null; };
