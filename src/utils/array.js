export function intersperse(as, separator) {
    return as.flatMap((a, i) => (i ? [separator(i), a] : [a]));
}
export function count(arr, pred) {
    let n = 0;
    for (const x of arr)
        n += +!!pred(x);
    return n;
}
export function uniq(xs) {
    return [...new Set(xs)];
}
