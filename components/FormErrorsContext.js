'use client';

import { createContext } from 'react';

/** Field-level errors returned by a server action as `{ fieldErrors: { name: message } }`. */
const FormErrorsContext = createContext({});
export default FormErrorsContext;
