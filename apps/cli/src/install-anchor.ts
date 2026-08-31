/** Installation identity shared by profile boot and package management. */

import { fileURLToPath, pathToFileURL } from 'node:url'

/** Absolute package.json of this dsh installation in source and built layouts. */
export const INSTALL_ANCHOR = fileURLToPath(new URL('../package.json', import.meta.url))

/** File URL base used by the Loader for safe-mode bare module resolution. */
export const INSTALL_MODULE_BASE_URL = pathToFileURL(INSTALL_ANCHOR).href
