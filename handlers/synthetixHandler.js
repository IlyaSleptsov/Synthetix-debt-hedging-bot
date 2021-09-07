const Web3 = require('web3');
const BN = require('bignumber.js');

const Etherscan = require('./../api/etherscan')

const ALCHEMY_BASE_URL = 'wss://eth-mainnet.alchemyapi.io/v2/'

class SynthetixHandler {
    constructor(SYNTHETIX_ADDRESS, ETHERSCAN_TOKEN, ALCHEMY_ID, TOLERANCE) {
        const alchemyProvider = new Web3.providers.WebsocketProvider(`${ALCHEMY_BASE_URL}${ALCHEMY_ID}`)

        this.SYNTHETIX_ADDRESS = SYNTHETIX_ADDRESS
        this.TOLERANCE = TOLERANCE

        this.etherscanA = new Etherscan(ETHERSCAN_TOKEN)
        this.web3 = new Web3(alchemyProvider);
    }


    Returns
    //[
    //   {
    //     synth: 'sUSD',
    //     usdBN: BigNumber { s: 1, e: 8, c: [Array] },
    //     percent: 33.527099256962416,
    //     usdStr: '314,802,245'
    //   },
    //   ....
    //]

    async getFilteredSynthetixData() {
        const { tokenObjArr } = await this.gatherData()
        tokenObjArr.sort(( a, b ) => b.percent - a.percent);
        const sortedArr = []
        for (const obj of tokenObjArr) {
            const { percent } = obj
            if (percent >= this.TOLERANCE) {
                sortedArr.push(obj)
            }
        }
        return sortedArr
    }

    async gatherData() {
        // iLINK: { price: 0, cap: 0, supply: 0 }
        const synthData = await this.getSynthMarketCap()

        //remove short and borrows of eth
        const multiETH = await this.getMultiCollateralIssuance('sETH')
        const wrappedETH = await this.getWrappedETH()
        synthData['sETH'].rawTokenSupply = new BN(synthData['sETH'].rawTokenSupply)
            .minus(multiETH)
            .minus(wrappedETH).toNumber()

        //remove short and borrows of btc
        const multiBTC = await this.getMultiCollateralIssuance('sBTC')
        synthData['sBTC'].rawTokenSupply = new BN(synthData['sBTC'].rawTokenSupply)
            .minus(multiBTC).toNumber()

        //remove borrows of usd and wrappr sUSD
        const multiUSD = await this.getMultiCollateralIssuance('sUSD')
        const wrappedUSD = await this.getWrappedUSD()
        synthData['sUSD'].rawTokenSupply = new BN(synthData['sUSD'].rawTokenSupply)
            .minus(multiUSD)
            .minus(wrappedUSD).toNumber()

        const synthArr = Object.keys(synthData)
        const tokenObject = {
            total: new BN(0)
        }
        for (const synth of synthArr) {
            const { price, rawTokenSupply } = synthData[synth]
            const tokenSupplyUSD = new BN(rawTokenSupply).times(1e6).times(price)
            tokenObject[synth] = {usd: tokenSupplyUSD }
            tokenObject.total = tokenObject.total.plus(tokenSupplyUSD.abs())
        }

        const { total } = tokenObject
        const tokenObjArr = []
        for (const synth of synthArr) {
            const { usd } = tokenObject[synth]
            const tokenDebtPercent = usd.div(total).times(100).abs()

            tokenObjArr.push({
                synth,
                usdBN: usd,
                percent: tokenDebtPercent.toNumber(),
                usdStr:usd.toFormat(0)
            })

            tokenObject[synth].percent = tokenDebtPercent
        }

        return { tokenObject, tokenObjArr }
    }

    async getSynthMarketCap() {
        console.log('[getSynthMarketCap] Counted synth values')
        const utilsContract = await this.getContract('SynthUtil')
        const synthSupplyList = await utilsContract.methods.synthsTotalSupplies().call()
        const synthHex = synthSupplyList['0']
        const intRawTokenSupply = synthSupplyList['1']
        const intCap = synthSupplyList['2']
        const synthObj = {}
        for (const i in synthHex) {
            const synthSymbol = this.web3.utils.toUtf8(synthHex[i])
            if (synthSymbol[0] === 's') {
                const bnIntCap = new BN(intCap[i])
                const bnIntSupply = new BN(intRawTokenSupply[i])

                const price = bnIntCap.div(bnIntSupply).toNumber() || 0
                const cap = bnIntCap.div(1e24).toNumber()
                const rawTokenSupply = bnIntSupply.div(1e24).toNumber()

                synthObj[synthSymbol] = {
                    price, cap, rawTokenSupply
                }
            }
        }
        console.log('[getSynthMarketCap] Finished')
        return synthObj
    }

    async getContract(contractName) {
        const proxyResolverAddress = '0x4E3b31eB0E5CB73641EE1E65E7dCEFe520bA3ef2'
        const proxyResolverABI = JSON.parse(await this.etherscanA.getABI(proxyResolverAddress))
        const proxyResolverContract = new this.web3.eth.Contract(proxyResolverABI, proxyResolverAddress)

        const resolverAddress = await proxyResolverContract.methods.target().call()
        const resolverABI = JSON.parse(await this.etherscanA.getABI(resolverAddress))
        const resolverContract = new this.web3.eth.Contract(resolverABI, resolverAddress)

        const contractNameHex = this.web3.utils.toHex(contractName)
        const address = await resolverContract.methods.getAddress(contractNameHex).call()
        const abi = JSON.parse(await this.etherscanA.getABI(address))

        return new this.web3.eth.Contract(abi, address)
    }

    async getMultiCollateralIssuance(currencyKey) {
        const contract = await this.getContract('CollateralManagerState')
        const currency = this.web3.utils.toHex(currencyKey)
        const { long, short } = await contract.methods.totalIssuedSynths(currency).call()

        const bnLong = new BN(long)
        const bnShort = new BN(short)

        return bnLong.plus(bnShort).div(1e24).toNumber()
    }

    async getWrappedETH() {
        const contract = await this.getContract('EtherWrapper')
        const eth = await contract.methods.sETHIssued().call()

        return new BN(eth).div(1e24).toNumber()
    }

    async getWrappedUSD() {
        const contract = await this.getContract('EtherWrapper')
        const usd = await contract.methods.sUSDIssued().call()

        return new BN(usd).div(1e24).toNumber()
    }

    async getUserDebt() {
        const address = this.SYNTHETIX_ADDRESS
        const proxyAddress = '0xc011a73ee8576fb46f5e1c5751ca3b9fe0af2a6f'
        const proxyAbi = JSON.parse(await this.etherscanA.getABI(proxyAddress))
        const proxyContract = new this.web3.eth.Contract(proxyAbi, proxyAddress)
        const resolverAddress = await proxyContract.methods.target().call()

        const resolverABI = JSON.parse(await this.etherscanA.getABI(resolverAddress))
        const resolverContract = new web3.eth.Contract(resolverABI, resolverAddress)
        const { alreadyIssued } = await resolverContract.methods.remainingIssuableSynths(address).call()
        return new BN(alreadyIssued).div(1e18)
    }
}

module.exports = SynthetixHandler
