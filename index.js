// auto-transfer.js
import { ethers } from "ethers";
import dotenv from "dotenv";
import fs from "fs";
import chalk from "chalk";
import { exit } from "process";
dotenv.config();

function getRpcList() {
    const rpcList = [];
    for (let i = 1; ; i++) {
        const name = process.env[`RPC_${i}_NAME`];
        const url = process.env[`RPC_${i}_URL`];
        const token = process.env[`RPC_${i}_TOKEN`];
        if (!name || !url) break;
        rpcList.push({ name, url, token });
    }
    return rpcList;
}

const erc20Abi = [
    "function balanceOf(address owner) view returns (uint256)",
    "function transfer(address to, uint256 value) returns (bool)",
    "function decimals() view returns (uint8)",
    "function symbol() view returns (string)"
];

function showBanner() {
    console.clear();
    console.log(chalk.magentaBright(`
========================================
  █████╗ ██╗   ██╗████████╗ ██████╗ 
 ██╔══██╗██║   ██║╚══██╔══╝██╔═══██╗
 ███████║██║   ██║   ██║   ██║   ██║
 ██╔══██║██║   ██║   ██║   ██║   ██║
 ██║  ██║╚██████╔╝   ██║   ╚██████╔╝
 ╚═╝  ╚═╝ ╚═════╝    ╚═╝    ╚═════╝ 
SAT SET AUTO TRANSFER
                           [by WIN]
========================================
`));
}

async function askQuestion(query) {
    process.stdout.write(chalk.yellow(query));
    return new Promise(resolve => {
        process.stdin.once("data", data => resolve(data.toString().trim()));
    });
}

async function getTokenInfo(provider, tokenAddress) {
    const tokenContract = new ethers.Contract(tokenAddress, erc20Abi, provider);
    const decimals = await tokenContract.decimals();
    const symbol = await tokenContract.symbol();
    return { decimals, symbol };
}

async function autoTransfer(selectedRpc) {
    const receiverFile = "addresspenerima.txt";
    const senderFile = "walletpengirim.txt";

    if (!fs.existsSync(receiverFile) || !fs.existsSync(senderFile)) {
        console.log(chalk.red(`❌ File '${receiverFile}' atau '${senderFile}' tidak ditemukan.`));
        exit(1);
    }

    const recipients = fs.readFileSync(receiverFile, "utf8").split("\n").map(p => p.trim()).filter(p => p.length > 0);
    const privateKeys = fs.readFileSync(senderFile, "utf8").split("\n").map(p => p.trim()).filter(p => p.length > 0);

    const provider = new ethers.JsonRpcProvider(selectedRpc.url);
    const tokenAddress = selectedRpc.token;

    const mode = await askQuestion("Pilih mode transfer (1 = native coin, 2 = token ERC-20): ");
    if (!["1", "2"].includes(mode)) {
        console.log(chalk.red("❌ Pilihan tidak valid!"));
        exit(1);
    }

    const allTransfer = await askQuestion("Transfer semua saldo? (y untuk YA, n untuk input manual): ");
    let amountInput = "0";
    if (allTransfer !== "y") {
        amountInput = await askQuestion("Masukkan jumlah yang akan dikirim (misal: 0.005): ");
    }

    console.log(chalk.yellow(`\n🚀 Chain: ${selectedRpc.name} | Mode: ${mode === "1" ? "Native Coin" : "Token ERC-20"} | Transfer: ${allTransfer === "y" ? "ALL" : amountInput}\n`));

    let tokenInfo;
    if (mode === "2") {
        tokenInfo = await getTokenInfo(provider, tokenAddress);
    }

    for (let i = 0; i < privateKeys.length; i++) {
        console.log(chalk.cyanBright(`👩‍💻 [${i + 1}] Memproses wallet ke-${i + 1}...`));
        let senderWallet;
        try {
            senderWallet = new ethers.Wallet(privateKeys[i], provider);
        } catch (error) {
            console.log(chalk.red(`❌   Gagal inisialisasi wallet: ${error.message}`));
            continue;
        }

        console.log(chalk.blueBright(`👛   Alamat: ${senderWallet.address}`));

        if (mode === "1") {
            try {
                const balance = await provider.getBalance(senderWallet.address);
                const gasPrice = await provider.gasPrice;
                const gasLimit = 21000n;
                const estimatedFee = gasPrice * gasLimit;
                let amountToSend;

                if (allTransfer === "y") {
                    amountToSend = balance - estimatedFee;
                } else {
                    amountToSend = ethers.parseEther(amountInput);
                }

                if (balance < amountToSend + estimatedFee) {
                    console.log(chalk.red("❌   Tidak cukup saldo untuk transfer dan gas."));
                    continue;
                }

                for (let j = 0; j < recipients.length; j++) {
                    const recipient = recipients[j];
                    console.log(chalk.blueBright(`👩‍💻   [${i + 1}.${j + 1}] Kirim ke penerima ke-${j + 1}: ${recipient}`));
                    const tx = await senderWallet.sendTransaction({
                        to: recipient,
                        value: amountToSend,
                        gasPrice,
                        gasLimit
                    });
                    console.log(chalk.green(`✅   TX Hash: ${tx.hash}`));
                    await tx.wait();
                }
            } catch (err) {
                console.log(chalk.red(`❌   Gagal transfer native: ${err.message}`));
            }
        }
    }
    console.log(chalk.greenBright("\n🎉 Semua akun telah diproses!\n"));
}

async function start() {
    showBanner();
    const rpcList = getRpcList();
    if (rpcList.length === 0) {
        console.log(chalk.red("❌ Tidak ada RPC ditemukan."));
        exit(1);
    }
    console.log("📜 Daftar Chain:");
    rpcList.forEach((rpc, index) => {
        console.log(`${index + 1}. ${rpc.name}`);
    });
    const selectedIndex = await askQuestion("Pilih chain yang akan digunakan (angka): ");
    const selectedRpc = rpcList[Number(selectedIndex) - 1];
    if (!selectedRpc) {
        console.log(chalk.red("❌ Pilihan tidak valid!"));
        exit(1);
    }
    console.log(chalk.green(`\n✅ Kamu memilih: ${selectedRpc.name}\n`));
    await autoTransfer(selectedRpc);
}

start();
