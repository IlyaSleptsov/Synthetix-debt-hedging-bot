require('dotenv').config()
const BN = require('bignumber.js');
const { Client, Intents } = require('discord.js');

const BinanceHandler = require('./handlers/binanceHandler')
const SynthetixHandler = require('./handlers/synthetixHandler')
const log = require('./handlers/logger')

const {
    DISCORD_TOKEN,

    ETHERSCAN_TOKEN,
    ALCHEMY_ID,
    MINIMAL_THRESHOLD_BUY,

    BINANCE_API,
    BINANCE_SECRET,
    DEFAULT_CRYPTO,

    TOLERANCE
} = process.env

const client = new Client({ intents: [Intents.FLAGS.GUILDS, Intents.FLAGS.GUILD_MESSAGES] });
const binanceH = new BinanceHandler(BINANCE_API, BINANCE_SECRET, DEFAULT_CRYPTO)
const synthetixH = new SynthetixHandler(ETHERSCAN_TOKEN, ALCHEMY_ID, MINIMAL_THRESHOLD_BUY)

const FILE_NAME = 'index'
const BLOCK_DELAY = 60000
const GIT_LINK = 'https://github.com/IlyaSleptsov/Synthetix-debt-hedging-bot'

const INIT_MESSAGE = '```Hey! This bot opens positions in accordance with the Synthetix debt structure and hedges against the risks of changes in the size of your personal debt.\n' +
    'Documentation: '+GIT_LINK+'```\n'

client.login(DISCORD_TOKEN)

client.on("ready", function() {
    console.log('Bot has started!')
});

client.on('messageCreate', async(message) => {
    let close = false
    if (message.author.bot) {
        return;
    }

    await checkInputParameters(message, process.env)

    const { cleanContent } = message
    const contentArr = cleanContent.split(' ')
    const command = contentArr[0]

    if (command === '!run') {
        message.channel.send(INIT_MESSAGE);
        await job(message)
        setInterval(async ()=> {
            if (!close) {
                await job(message)
            }
        }, BLOCK_DELAY)
    }
    else if (command === '!close') {
        close = true
        await binanceH.convertTradeFees()
        const advancedBinanceObject = await binanceH.getAdvancedBalancesInfo()
        await binanceH.convertPositions(advancedBinanceObject)
        await closePositions(message, advancedBinanceObject)
        process.exit()
    }
    else {
        const text = `Wrong command!`
        message.channel.send(text);
    }
})

async function checkInputParameters(message, config) {
    let err = false
    const importantParameters =
        [
            'DISCORD_TOKEN',
            'ETHERSCAN_TOKEN',
            'ALCHEMY_ID',
            'MINIMAL_THRESHOLD_BUY',
            'BINANCE_API',
            'BINANCE_SECRET',
            'TOLERANCE'
        ]
    for (const param of importantParameters) {
        if (!config[param]) {
            err = true
            const errMsg = `Failed to run the algorithm. Please, check field ${param} in Env-config!`
            await message.channel.send('```'+errMsg+'```');
        }
    }
    if (err) {
        process.exit()
    }
}

async function job(message) {
    const METHOD = 'job'

    log(FILE_NAME, METHOD, 'Started global check!')


    await binanceH.convertTradeFees()

    const advancedBinanceObject = await binanceH.getAdvancedBalancesInfo()

    console.log(JSON.stringify(advancedBinanceObject, null, 2))

    const synthetixGlobalData = await synthetixH.getFilteredSynthetixData()

    const { needRebalance, difObj } = await isRebalanceCase(advancedBinanceObject, synthetixGlobalData)

    if (needRebalance) {
        await sendBinanceBalanceData(message, advancedBinanceObject)
        await sendSynthetixData(message, difObj)
        await binanceH.convertPositions(advancedBinanceObject)

        await binanceH.placeInSynthDistribution(difObj)
        const updBalanceObj = await binanceH.getAdvancedBalancesInfo()
        const { difObj: updDifObj } = await isRebalanceCase(updBalanceObj, synthetixGlobalData)
        await finishRebalance(message, updDifObj)
    }
}

async function closePositions(message) {
    let balanceMessage = 'Done.\n'
    await message.channel.send('```'+balanceMessage+'```');
}


async function sendBinanceBalanceData(message, advancedBinanceObject) {
    let balanceMessage = 'Connected to the exchange. Your balance:\n'
    const { spot, margin } = advancedBinanceObject
    if (Object.keys(spot).length > 0) {
        balanceMessage = balanceMessage +
            `\nSpot:\n`

        for (const cur in spot) {
            const {
                price,
                amount,
                usd,
                percent
            } = spot[cur]
            balanceMessage = balanceMessage +
                `\n${cur}:\n`+
                `USD price: ${price}\n`+
                `Amount: ${amount} ${cur}\n`+
                `Value: ${usd} USDT\n`+
                `Percentage of balance: ${prettyPercent(percent)}%\n`
        }
    }
    if (Object.keys(margin).length > 0) {
        balanceMessage = balanceMessage +
            `\nMargin:\n`

        for (const cur in margin) {
            const {
                price,
                amount,
                usd,
                percent
            } = margin[cur]
            balanceMessage = balanceMessage +
                `\n${cur}:\n`+
                `USD price: ${price}\n`+
                `Amount: ${amount} ${cur}\n`+
                `Value: ${usd} USDT\n`+
                `Percentage of balance: ${prettyPercent(percent)}%\n`
        }
    }
    await message.channel.send('```'+balanceMessage+'```');
}

async function sendSynthetixData(message, difObj) {
    let debtMessage = 'Current debt structure:\n'

    for (const cur in difObj) {
        const {
            synthPercent,
            dif,
            binancePercent,
            tradeCase,
        } = difObj[cur]

        debtMessage = debtMessage +
            `\n${cur}:\n`+
            `Side: ${tradeCase}\n`+
            `Synth Percent: ${prettyPercent(synthPercent)}%\n`+
            `Binance Percent: ${prettyPercent(binancePercent)}%\n`+
            `Diff: ${prettyPercent(dif)}%\n`
    }

    await message.channel.send('```'+debtMessage+'```');
}

async function finishRebalance(message, difObj) {
    let finishMessage = 'Rebalancing completed. Your portfolio:\n'

    for (const cur in difObj) {
        const {
            synthPercent,
            dif,
            binancePercent,
            tradeCase,
        } = difObj[cur]

        finishMessage = finishMessage +
            `\n${cur}:\n`+
            `Side: ${tradeCase}\n`+
            `Synth Percent: ${prettyPercent(synthPercent)}%\n`+
            `Binance Percent: ${prettyPercent(binancePercent)}%\n`+
            `Diff: ${prettyPercent(dif)}%\n`
    }

    await message.channel.send('```'+finishMessage+'```');
}

function prettyPercent(percent) {
    return new BN(percent).dp(3, BN.ROUND_FLOOR).toNumber()
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
