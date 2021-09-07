const crypto = require('crypto');
const fetch = require('node-fetch');

const log = require('./../handlers/logger')

const BASE_URL = 'https://api.binance.com'

const PRICE_ENDPOINT = '/api/v3/ticker/price'
const SPOT_BALANCE_ENDPOINT = '/api/v3/account'
const MARGIN_BALANCE = '/sapi/v1/margin/account'
const MARGIN_CLOSE_ENDPOINT = '/sapi/v1/margin/repay'
const SPOT_NEW_ORDER_ENDPOINT = '/api/v3/order'
const MARGIN_TRANSFER_ENDPOINT = '/sapi/v1/margin/transfer'
const MARGIN_OPEN_ENDPOINT = '/sapi/v1/margin/loan'
const TRADE_FEE_ENDPOINT = '/sapi/v1/asset/tradeFee'

const FILE_NAME = 'binance'

class Binance {
    constructor(apiToken, secretToken) {
        this.API = apiToken
        this.SECRET = secretToken
    }

    async getSpotBalance() {
        const METHOD = 'getSpotBalance'
        log(FILE_NAME, METHOD, 'Requesting spot balance...')

        const params = `timestamp=${Date.now()}`

        const signature = crypto.createHmac('sha256', this.SECRET).update(params).digest('hex')
        const url = `${BASE_URL}${SPOT_BALANCE_ENDPOINT}?${params}&signature=${signature}`

        const response = await fetch(url, {
            method: 'GET',
            headers: {
                'content-type': 'application/json',
                'X-MBX-APIKEY': this.API
            },
        })

        const data = await response.json()

        log(FILE_NAME, METHOD, 'Data received!')

        return data
    }

    async getMarginBalance() {
        const METHOD = 'getMarginBalance'
        log(FILE_NAME, METHOD, 'Requesting margin balance...')

        const params = `timestamp=${Date.now()}`
        const signature = crypto.createHmac('sha256', this.SECRET).update(params).digest('hex');

        const url = `${BASE_URL}${MARGIN_BALANCE}?${params}&signature=${signature}`

        const response = await fetch(url, {
            method: 'GET',
            headers: {
                'content-type': 'application/json',
                'X-MBX-APIKEY': this.API
            },
        });
        const data = await response.json()

        log(FILE_NAME, METHOD, 'Data received!')

        return data
    }

    async getPrices() {
        const METHOD = 'getPrices'
        log(FILE_NAME, METHOD, 'Requesting binance prices...')

        const url = `${BASE_URL}${PRICE_ENDPOINT}`

        const response = await fetch(url, {
            method: 'GET',
            headers: {
                'content-type': 'application/json',
                'X-MBX-APIKEY': this.API
            }
        });
        const data = await response.json()

        log(FILE_NAME, METHOD, 'Data received!')

        return data
    }

    //{
    // "symbol":"BTCUSDT",
    // "orderId":7328606773,
    // "orderListId":-1,
    // "clientOrderId":"waz8ZoWJ32iZSywPU9euwf",
    // "transactTime":1630065942942,
    // "price":"0.00000000",
    // "origQty":"0.00026000",
    // "executedQty":"0.00026000",
    // "cummulativeQuoteQty":"12.34420200",
    // "status":"FILLED",
    // "timeInForce":"GTC",
    // "type":"MARKET",
    // "side":"SELL",
    // "fills":[
    //     {"price":"47477.70000000",
    //     "qty":"0.00026000",
    //     "commission":"0.01234420",
    //     "commissionAsset":"USDT",
    //     "tradeId":1027240809}
    //    ]
    // }
    //
    //{
    // "symbol":"USDTRUB",
    // "orderId":22712709,
    // "orderListId":-1,
    // "clientOrderId":"zgK3aMEUblipIoCOc2SQpZ",
    // "transactTime":1630067628984,
    // "price":"0.00000000",
    // "origQty":"14.00000000",
    // "executedQty":"14.00000000",
    // "cummulativeQuoteQty":"1045.94000000",
    // "status":"FILLED","timeInForce":"GTC",
    // "type":"MARKET",
    // "side":"BUY",
    // "fills":[
    // {"price":"74.71000000",
    // "qty":"14.00000000",
    // "commission":"0.01400000",
    // "commissionAsset":"USDT",
    // "tradeId":4401193}
    // ]
    // }

    async spotNewOrder(symbol, side, type, quantity) {
        const METHOD = 'spotNewOrder'
        log(FILE_NAME, METHOD, `params = (${symbol}, ${side}, ${type}, ${quantity})`)

        const params = `quoteOrderQty=${quantity}&type=${type}&side=${side}&symbol=${symbol}&timestamp=${Date.now()}`
        const signature = crypto.createHmac('sha256', this.SECRET).update(params).digest('hex');

        const url = `${BASE_URL}${SPOT_NEW_ORDER_ENDPOINT}?${params}&signature=${signature}`

        const response = await fetch(url, {
            method: 'POST',
            headers: {
                'content-type': 'application/json',
                'X-MBX-APIKEY': this.API
            },
        });
        const data = await response.json()

        log(FILE_NAME, METHOD, 'Data received!')

        return data
    }

    //{
    //   "tranId": 74505604216,
    //   "clientTag": ""
    // }
    async marginTransfer(asset, amount, type) {
        const METHOD = 'marginTransfer'
        log(FILE_NAME, METHOD, `params = (${asset}, ${amount}, ${type})`)
        const params = `amount=${amount}&asset=${asset}&type=${type}&timestamp=${Date.now()}`
        const signature = crypto.createHmac('sha256', this.SECRET).update(params).digest('hex');

        const url = `${BASE_URL}${MARGIN_TRANSFER_ENDPOINT}?${params}&signature=${signature}`

        const response = await fetch(url, {
            method: 'POST',
            headers: {
                'content-type': 'application/json',
                'X-MBX-APIKEY': this.API
            },
        });
        const data = await response.json()

        log(FILE_NAME, METHOD, 'Data received!')

        return data
    }

    // {
    //   "tranId": 74505604216,
    //   "clientTag": ""
    // }
    async closeMargin(asset, amount) {
        const METHOD = 'closeMargin'
        log(FILE_NAME, METHOD, `params = (${asset}, ${amount})`)

        const params = `amount=${amount}&asset=${asset}&timestamp=${Date.now()}`
        const signature = crypto.createHmac('sha256', this.SECRET).update(params).digest('hex');

        const url = `${BASE_URL}${MARGIN_CLOSE_ENDPOINT}?${params}&signature=${signature}`

        const response = await fetch(url, {
            method: 'POST',
            headers: {
                'content-type': 'application/json',
                'X-MBX-APIKEY': this.API
            },
        });
        const data = await response.json()

        log(FILE_NAME, METHOD, 'Data received!')

        return data
    }

    // {
    //   "tranId": 74505604216,
    //   "clientTag": ""
    // }
    async openMargin(asset, amount) {
        const METHOD = 'openMargin'
        log(FILE_NAME, METHOD, `params = (${asset}, ${amount})`)

        const params = `amount=${amount}&asset=${asset}&timestamp=${Date.now()}`
        const signature = crypto.createHmac('sha256', this.SECRET).update(params).digest('hex');

        const url = `${BASE_URL}${MARGIN_OPEN_ENDPOINT}?${params}&signature=${signature}`

        const response = await fetch(url, {
            method: 'POST',
            headers: {
                'content-type': 'application/json',
                'X-MBX-APIKEY': this.API
            },
        });
        const data = await response.json()

        log(FILE_NAME, METHOD, 'Data received!')

        return data
    }

    // [
    //     {
    //         symbol: '1INCHBTC',
    //         makerCommission: '0.001',
    //         takerCommission: '0.001'
    //     },
    //     ....
    // ]
    async getTradeFee() {
        const METHOD = 'getTradeFee'
        log(FILE_NAME, METHOD, `Requesting trade fee...`)
        const params = `timestamp=${Date.now()}`
        const signature = crypto.createHmac('sha256', this.SECRET).update(params).digest('hex');

        const url = `${BASE_URL}${TRADE_FEE_ENDPOINT}?${params}&signature=${signature}`

        const response = await fetch(url, {
            method: 'GET',
            headers: {
                'content-type': 'application/json',
                'X-MBX-APIKEY': this.API
            }
        });
        const data = await response.json()

        log(FILE_NAME, METHOD, 'Data received!')

        return data
    }

}
module.exports = Binance
