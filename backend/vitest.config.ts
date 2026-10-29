import { configDefaults } from 'vitest/config'
import { baseConfig } from './vitest.base.ts'

// test/defect-demo is supposed to fail, so it only runs via `npm run test:defect`.
export default baseConfig({ exclude: [...configDefaults.exclude, 'test/defect-demo/**'] })
