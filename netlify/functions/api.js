import serverless from 'serverless-http'
import * as serverModule from '../../services/api/src/server.js'

const candidate = serverModule.default ?? serverModule
const app = candidate.default ?? candidate

export const handler = serverless(app)
