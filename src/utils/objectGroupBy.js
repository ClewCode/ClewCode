/**
 * https://tc39.es/ecma262/multipage/fundamental-objects.html#sec-object.groupby
 */
export function objectGroupBy(items, keySelector) {
    const result = Object.create(null);
    let index = 0;
    for (const item of items) {
        const key = keySelector(item, index++);
        if (result[key] === undefined) {
            result[key] = [];
        }
        result[key].push(item);
    }
    return result;
}
