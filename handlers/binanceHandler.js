const BN = require('bignumber.js');

const Binance = require('../api/binance')
const config = require('../dev.config.json')

class BinanceHandler {
    constructor(apiToken, secretToken) {
        this.binance = new Binance(apiToken, secretToken)
        this.feeObj = {}
        this.pricesObj = {}
    }

    async convertTradeFees() {
        const feeData = await this.binance.getTradeFee()
        for (const obj of feeData) {
            const { symbol, takerCommission } = obj
            const bnFee = new BN(takerCommission)
            this.feeObj[symbol] = {fee: bnFee.toNumber(), bnFee}
        }
        console.log(JSON.stringify(this.feeObj, null, 2))
    }

    async convertToTether(advancedBinanceObject) {
        const { spot, margin } = advancedBinanceObject
        for (const cur in spot) {
            const {
                price,
                usd,
                amount,
                type,
                percent,
            } = spot[cur]

            const { minBinanceOrderAmount } = config
            const {decimals: usdtDecimals } = config.binanceCurs.USDT

            const binanceDecimals = config.binanceCurs[cur]
                ? config.binanceCurs[cur].decimals
                : config.defaultRoundDecimals

            const binanceConvertedUsd = new BN(usd).dp(usdtDecimals, BN.ROUND_FLOOR)
            const binanceConvertedAmount = new BN(amount).dp(binanceDecimals, BN.ROUND_FLOOR)

            if (usd > minBinanceOrderAmount) {
                if (type === 1) {
                    const pair = `${cur}USDT`
                    const fee = binanceConvertedUsd.times(this.feeObj[pair].bnFee)
                    const totalAmount = binanceConvertedUsd.minus(fee).dp(usdtDecimals, BN.ROUND_FLOOR)

                    const orderData = await this.binance
                        .spotNewOrder(`${cur}USDT`, 'SELL','MARKET', totalAmount.toNumber())

                    //{"symbol":"BTCUSDT","orderId":7328606773,"orderListId":-1,"clientOrderId":"waz8ZoWJ32iZSywPU9euwf","transactTime":1630065942942,"price":"0.00000000","origQty":"0.00026000","executedQty":"0.00026000","cummulativeQuoteQty":"12.34420200","status":"FILLED","timeInForce":"GTC","type":"MARKET","side":"SELL","fills":[{"price":"47477.70000000","qty":"0.00026000","commission":"0.01234420","commissionAsset":"USDT","tradeId":1027240809}]}
                    console.log(JSON.stringify(orderData))
                }
                if (type === -1) {
                    const pair = `USDT${cur}`
                    const fee = binanceConvertedAmount.times(this.feeObj[pair].bnFee)
                    const totalAmount = binanceConvertedAmount.minus(fee).dp(binanceDecimals, BN.ROUND_FLOOR)

                    const orderData = await this.binance
                        .spotNewOrder(`USDT${cur}`, 'BUY','MARKET', totalAmount.toNumber())

                    console.log(JSON.stringify(orderData))
                }
            }
        }

        for (const cur in margin) {
            const {
                price,
                type,
                marginObj
            } = margin[cur]

            const {
                free,
                borrowed,
                netAsset,
            } = marginObj

            if (borrowed === 0) {
                await this.binance.marginTransfer(cur, free, 2)
            }
            else {
                if (netAsset >= 0) {
                    const closeMarginObj = await this.binance.closeMargin(cur, free)
                    console.log(JSON.stringify(closeMarginObj, null, 2))
                }
                else {
                    const {minBinanceOrderAmount} = config
                    const usdAsset = Math.abs(new BN(netAsset).times(price).toNumber())
                    const usdAmountToTrade = usdAsset > minBinanceOrderAmount
                        ? usdAsset
                        : minBinanceOrderAmount
                    if (type === 1) {
                        const pair = `${cur}USDT`
                        const fee = new BN(usdAmountToTrade).times(this.feeObj[pair].bnFee)
                        const totalAmount = new BN(usdAmountToTrade).plus(fee).dp(0, BN.ROUND_FLOOR)

                        const orderData = await this.binance
                            .spotNewOrder(`${cur}USDT`, 'BUY', 'MARKET', totalAmount.toNumber())
                        console.log(JSON.stringify(orderData, null, 2))
                        await this.binance.marginTransfer(cur, Math.abs(netAsset), 1)
                        await this.binance.closeMargin(cur, free)
                    }
                }
            }
        }
    }

    // Returns:
    //{
    //   spot: {
    //     BTC: {
    //       price: 47233.54,
    //       usd: 0.0434548568,
    //       amount: 9.2e-7,
    //       type: 1,
    //       percent: 0.013346085643848473
    //     },
    //     ...
    //  },
    //  margin: {
    //      ETH: {
    //       price: 3131.91,
    //       usd: 0.2515550112,
    //       amount: 0.00008032,
    //       type: 1,
    //       marginObj: {
    //          free: 0.00008032,
    //          locked: 0,
    //          borrowed: 0,
    //          interest: 0,
    //          netAsset: 0.00008032
    //       },
    //       percent: 0.07725890661810815
    //     },
    //     ...
    //  }
    //}

    async getAdvancedBalancesInfo() {
        const advancedBalanceObj = {spot:{}, margin:{}}
        const spotBalanceObj = await this.spotBalance()
        const marginBalanceObj = await this.marginBalance()

        let sumUsd = new BN(0)

        await this.getPriceInfo()

        for (const cur in marginBalanceObj) {
            if (this.pricesObj[`${cur}USDT`]) {
                const price = this.pricesObj[`${cur}USDT`]
                const amount = marginBalanceObj[cur].free
                const usd = price.times(amount).toNumber()
                sumUsd = sumUsd.plus(usd)
                advancedBalanceObj.margin[cur] = {
                    price:price.toNumber(), usd, amount, type: 1, marginObj: marginBalanceObj[cur]
                }
            }
            else if (this.pricesObj[`USDT${cur}`]) {
                const price = this.pricesObj[`USDT${cur}`]
                const amount = marginBalanceObj[cur].free
                const usd = new BN(amount).div(price).toNumber()
                sumUsd = sumUsd.plus(usd)
                advancedBalanceObj.margin[cur] = {
                    price:price.toNumber(), usd, amount, type: -1, marginObj: marginBalanceObj[cur]
                }
            }

            else {
                console.log(`[convertBalances] WARNING: No Tether price pair for ${cur}!`)
            }
        }

        for (const cur in spotBalanceObj) {
            if (this.pricesObj[`${cur}USDT`]) {
                const price = this.pricesObj[`${cur}USDT`]
                const amount = spotBalanceObj[cur]
                const usd = price.times(amount).toNumber()
                sumUsd = sumUsd.plus(usd)
                advancedBalanceObj.spot[cur] = {
                    price:price.toNumber(), usd, amount, type: 1
                }
            }
            else if (this.pricesObj[`USDT${cur}`]) {
                const price = this.pricesObj[`USDT${cur}`]
                const amount = spotBalanceObj[cur]
                const usd = new BN(amount).div(price).toNumber()
                sumUsd = sumUsd.plus(usd)
                advancedBalanceObj.spot[cur] = {
                    price:price.toNumber(), usd, amount, type: -1
                }
            }
            else if (cur === 'USDT') {
                const price = 1
                const amount = spotBalanceObj[cur]
                const usd = amount
                sumUsd = sumUsd.plus(usd)
                advancedBalanceObj.spot[cur] = {
                    price, amount, usd, type: 0
                }
            }
            else {
                console.log(`[convertBalances] WARNING: No Tether price pair for ${cur}!`)
            }
        }

        for (const cur in advancedBalanceObj.spot) {
            advancedBalanceObj.spot[cur].percent = new BN(advancedBalanceObj.spot[cur].usd).div(sumUsd).times(100).toNumber()
        }

        for (const cur in advancedBalanceObj.margin) {
            advancedBalanceObj.margin[cur].percent = new BN(advancedBalanceObj.margin[cur].usd).div(sumUsd).times(100).toNumber()
        }

        return advancedBalanceObj
    }

    async spotBalance() {
        const balanceObj = {}
        const { balances: curBalancesArr } = await this.binance.getSpotBalance()
        for (const curBalanceObj of curBalancesArr) {
            const { free, asset } = curBalanceObj
            const size = new BN(free).toNumber()
            if (size > 0) {
                balanceObj[asset] = size
            }
        }
        return balanceObj
    }

    async getPriceInfo() {
        const pricesArr = await this.binance.getPrices()
        for (const priceObj of pricesArr) {
            const { symbol, price } = priceObj
            this.pricesObj[symbol] = new BN(price)
        }
    }


    //{
    //       asset: 'ETH',
    //       free: '0.0057881',
    //       locked: '0',
    //       borrowed: '0.0057077',
    //       interest: '0.00000008',
    //       netAsset: '0.00008032'
    //     },
    //{
    //       asset: 'ETH',
    //       free: '0.0001937',
    //       locked: '0',
    //       borrowed: '0.0057077',
    //       interest: '0.00000008',
    //       netAsset: '-0.00551408'
    //     },

    async marginBalance() {
        const balanceObj = {}
        const { userAssets } = await this.binance.getMarginBalance()
        for (const curObj of userAssets) {
            const { asset, free, locked, borrowed, interest, netAsset } = curObj
            if ((parseFloat(netAsset) !== 0 || parseFloat(borrowed) !== 0)  && asset !== 'USDT') {
                balanceObj[asset] = {
                    free: new BN(free).toNumber(),
                    locked: new BN(locked).toNumber(),
                    borrowed: new BN(borrowed).toNumber(),
                    interest: new BN(interest).toNumber(),
                    netAsset: new BN(netAsset).toNumber()
                }
            }
        }
        return balanceObj
    }

    async placeInSynthDistribution(difObj) {
        let totalPercent = new BN(0)
        console.log(await this.spotBalance())
        const { USDT: usdStr } = await this.spotBalance()
        for (const cur in difObj) {
            const { synthPercent, tradeCase } = difObj[cur]
            if (cur !== 'USD') {
                if (tradeCase === 'spot') {
                    const usdAmount = new BN(usdStr).times(synthPercent).div(100).toNumber()
                    const {minBinanceOrderAmount} = config

                    const usdAmountToTrade = usdAmount > minBinanceOrderAmount
                        ? usdAmount
                        : minBinanceOrderAmount

                    const pair = `${cur}USDT`
                    const fee = new BN(usdAmountToTrade).times(this.feeObj[pair].bnFee)
                    const totalAmount = new BN(usdAmountToTrade).plus(fee).dp(0, BN.ROUND_FLOOR)
                    const orderData = await this.binance
                        .spotNewOrder(pair, 'BUY', 'MARKET', totalAmount.toNumber())
                    console.log(JSON.stringify(orderData, null, 2))
                }
                else {
                    const pair = `${cur}USDT`
                    const binanceDecimals = config.binanceCurs[cur]
                        ? config.binanceCurs[cur].decimals
                        : config.defaultRoundDecimals

                    const usdAmount = new BN(usdStr).times(synthPercent).div(100).toNumber()
                    const { minBinanceOrderAmount } = config

                    const usdAmountToTrade = usdAmount > minBinanceOrderAmount
                        ? usdAmount
                        : minBinanceOrderAmount

                    const curAmountToTrade = new BN(usdAmountToTrade).div(this.pricesObj[pair])
                    const fee = new BN(curAmountToTrade).times(this.feeObj[pair].bnFee)
                    const totalAmount = new BN(curAmountToTrade).plus(fee).dp(binanceDecimals, BN.ROUND_FLOOR)

                    const orderData = await this.binance
                        .openMargin(cur, totalAmount)
                    console.log(JSON.stringify(orderData, null, 2))
                }
            }
            totalPercent = totalPercent.plus(synthPercent)
        }

        const otherTokenPercent = new BN(100).minus(totalPercent).toNumber()
        const usdAmount = new BN(usdStr).times(otherTokenPercent).div(100).toNumber()
        const { minBinanceOrderAmount } = config

        const usdAmountToTrade = usdAmount > minBinanceOrderAmount
            ? usdAmount
            : minBinanceOrderAmount

        const pair = `ETHUSDT`
        const fee = new BN(usdAmountToTrade).times(this.feeObj[pair].bnFee)
        const totalAmount = new BN(usdAmountToTrade).plus(fee).dp(0, BN.ROUND_FLOOR)

        const orderData = await this.binance
            .spotNewOrder(pair, 'BUY', 'MARKET', totalAmount.toNumber())
        console.log(JSON.stringify(orderData, null, 2))

    }

}
module.exports = BinanceHandler
