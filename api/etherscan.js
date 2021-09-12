const fetch = require('node-fetch')

const log = require('./../handlers/logger')

const ABI_URL = 'https://api.etherscan.io/api?module=contract&action=getabi'
const FILE_NAME = 'etherscan'

class Etherscan {
    constructor(token) {
        this.token = token
        this.abis = {}
    }

    async getABI(address) {
        const METHOD = 'getABI'
        if (!this.abis[address]) {
            log(FILE_NAME, METHOD, `First request of ${address}`)
            const response = await fetch(`${ABI_URL}&address=${address}&apikey=${this.token}`, {
                method: 'GET',
                headers: {
                    'content-type': 'application/json',
                },
            });
            const { result } = await response.json()
            this.abis[address] = result
            return result
        }
        else {
            log(FILE_NAME, METHOD, `ABI for ${address} was requested!`)
            return this.abis[address]
        }
    }
}
module.exports = Etherscan
