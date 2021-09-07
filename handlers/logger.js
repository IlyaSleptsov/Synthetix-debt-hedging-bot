module.exports = function log(file, method, data) {
    const date = new Date().toJSON()
        .replace('T', ' ')
        .replace('Z', '')

    console.log(`[${date}] (${file} : ${method}) ${data}`)
}
