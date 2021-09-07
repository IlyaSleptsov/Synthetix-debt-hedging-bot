const fetch = require('node-fetch')
const ABI_URL = 'https://api.etherscan.io/api?module=contract&action=getabi'

class Etherscan {
    constructor(token) {
        this.token = token
    }

    async getABI(address) {
        const response = await fetch(`${ABI_URL}&address=${address}&apikey=${this.token}`, {
            method: 'GET',
            headers: {
                'content-type': 'application/json',
            },
        });
        const { result } = await response.json()
        return result
    }
}
module.exports = Etherscan
