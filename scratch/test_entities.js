import { decodeHtmlEntities } from '../src/utils/htmlEntities.js'

const inputs = [
  '&quot;bin&quot;',
  '&lt;b&gt;bold&lt;/b&gt;',
  '&#34;quote&#34;',
  '&#x22;quote&#x22;',
  '&middot;',
]

for (const input of inputs) {
  console.log(`${input} => ${decodeHtmlEntities(input)}`)
}
