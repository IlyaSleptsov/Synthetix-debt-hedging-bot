require('dotenv').config()
const Web3 = require("web3");
const BN = require('bignumber.js');
const { Client, Intents } = require('discord.js');

const BinanceHandler = require('./handlers/binanceHandler')
const SynthetixHandler = require('./handlers/synthetixHandler')

const BLOCK_DELAY = 30000


const {
    DISCORD_TOKEN,
    DISCORD_PREFIX,

    SYNTHETIX_ADDRESS,
    ETHERSCAN_TOKEN,
    ALCHEMY_ID,
    MINIMAL_THRESHOLD_BUY,

    BINANCE_API,
    BINANCE_SECRET,

    TOLERANCE
} = process.env

const client = new Client({ intents: [Intents.FLAGS.GUILDS, Intents.FLAGS.GUILD_MESSAGES] });

const binanceH = new BinanceHandler(BINANCE_API, BINANCE_SECRET)
const synthetixH = new SynthetixHandler(SYNTHETIX_ADDRESS, ETHERSCAN_TOKEN, ALCHEMY_ID, MINIMAL_THRESHOLD_BUY)

// client.login(DISCORD_TOKEN)
//
// client.on("ready", function() {
//     console.log(client.user.username + " started!");
// });
//
// client.on('messageCreate', async(message) => {
//     let prefix = DISCORD_PREFIX
//     if (message.author.bot) {
//         return;
//     }
//     if (!message.content.startsWith(prefix)) {
//         const text = `Please use command prefix "${prefix}"`
//         message.channel.send(text);
//     }
//     const { cleanContent } = message
//     const contentArr = cleanContent.split(' ')
//     const command = contentArr[0]
//
//     if (command === '!run') {
//         message.channel.send('Script was launched!');
//         setInterval(async ()=> {
//             await job(message)
//         }, BLOCK_DELAY)
//     }
//
// })

job()

async function job() {

    await binanceH.convertTradeFees()

    const advancedBinanceObject = await binanceH.getAdvancedBalancesInfo()

    const synthetixGlobalData = await synthetixH.getFilteredSynthetixData()

    const { needRebalance, difObj } = await isRebalanceCase(advancedBinanceObject, synthetixGlobalData)

    console.log(JSON.stringify(difObj, null, 2))
    if (needRebalance) {
        await binanceH.convertToTether(advancedBinanceObject)
        await binanceH.placeInSynthDistribution(difObj)
    }
}

//
//{
//   USD: {
//     synthPercent: 33.301308852633284,
//     dif: 35.98138155036408,
//     binancePercent: 69.28269040299736
//   },
//   ETH: {
//     synthPercent: 25.579079415790776,
//     dif: 25.50183557443052,
//     binancePercent: 0.07724384136025766
//   },
//   BTC: {
//     synthPercent: 20.44605048792662,
//     dif: 20.43270554684544,
//     binancePercent: 0.013344941081180128
//   },
//   EUR: {
//     synthPercent: 10.767207319584129,
//     dif: 10.767207319584129,
//     binancePercent: 0
//   },
//   LINK: {
//     synthPercent: 7.379811334554653,
//     dif: 7.379811334554653,
//     binancePercent: 0
//   }
// }

async function isRebalanceCase(binanceData, synthetixData) {
    let needRebalance = false
    const difObj = {}
    for (const synthObj of synthetixData) {
        const { synth, percent: synthPercent, usdBN } = synthObj
        const originalCur = synth.slice(1)

        const tradeCase = (usdBN.toNumber() > 0) ? 'spot' : 'margin'

        if (originalCur === 'USD' && binanceData[tradeCase]['USDT']) {
            const { percent: binancePercent } = binanceData[tradeCase]['USDT']
            const absoluteDif = Math.abs(binancePercent-synthPercent)
            if (Math.abs(binancePercent-synthPercent) > TOLERANCE) {
                needRebalance = true
            }
            difObj[originalCur] = { synthPercent, dif:absoluteDif, binancePercent, tradeCase }
        }
        else {
            if (binanceData[tradeCase][originalCur]) {
                const { percent: binancePercent } = (usdBN.toNumber() > 0)
                    ? binanceData.spot[originalCur]
                    : binanceData.margin[originalCur]
                const absoluteDif = Math.abs(binancePercent-synthPercent)
                if (Math.abs(binancePercent-synthPercent) > TOLERANCE) {
                    needRebalance = true
                }
                difObj[originalCur] = { synthPercent, dif:absoluteDif, binancePercent, tradeCase }
            }
            else {
                difObj[originalCur] = { synthPercent, dif:synthPercent, binancePercent:0, tradeCase }
                needRebalance = true
            }
        }
    }
    return { needRebalance, difObj }
}


// async function sendBinanceData(message) {
//     let balance = await binance.fetchBalance()
//     console.log(balance)
//     // let text =
//     //     `Binance User Data (apiKey: ${BINANCE_API.substr(0,5)}***):\n`+
//     //     `Margin: 0 ETH`
//     // message.channel.send(text);
//
// }
//
// async function sendSynthetixGlobalData(message) {
//     const sortedArr = await synthetixH.getFilteredSynthetixData()
//     let text = `Synthetix Global Debt:`
//     for (const obj of sortedArr) {
//         const { synth, percent, usdStr } = obj
//         text = text+
//             `\n${synth}\n`+
//             `Total: ${usdStr}$\n`+
//             `% of Pool: ${new BN(percent).toFixed(2)}%\n`
//     }
//     message.channel.send(text);
// }
//
// async function sentSynthetixUserDebt(message) {
//     const usdDebtBN = await synthetixH.getUserDebt()
//     let text =
//         `Synthetix User Debt:\n`+
//         `${usdDebtBN.toFormat(2)}$ (address: ${SYNTHETIX_ADDRESS.substr(0,5)}***)`
//     message.channel.send(text);
// }
