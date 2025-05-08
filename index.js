import { ethers } from "ethers";
import dotenv from "dotenv";
import fs from "fs";
import chalk from "chalk";
import { exit } from "process";
dotenv.config();

// Ambil semua RPC dari .env
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

// ABI ERC-20
const erc20Abi = [
    "function balanceOf(address owner) view returns (uint256)",
    "function transfer(address to, uint256 value) returns (bool)",
    "function decimals() view returns (uint8)",
    "function symbol() view returns (string)"
];

// Tampilkan banner
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

// Fungsi input CLI
async function askQuestion(query) {
    process.stdout.write(chalk.yellow(query));
    return new Promise(resolve => {
        process.stdin.once("data", data => resolve(data.toString().trim()));
    });
}

// Ambil info token: decimals & symbol
async function getTokenInfo(provider, tokenAddress) {
    const tokenContract = new ethers.Contract(tokenAddress, erc20Abi, provider);
    const decimals = await tokenContract.decimals();
    const symbol = await tokenContract.symbol();
    return { decimals, symbol };
}

// Fungsi utama transfer
async function autoTransfer(selectedRpc) {
    const receiverFile = "addresspenerima.txt";
    const senderFile = "walletpengirim.txt";

    if (!fs.existsSync(receiverFile) || !fs.existsSync(senderFile)) {
        console.log(chalk.red(`❌ File '${receiverFile}' atau '${senderFile}' tidak ditemukan.`));
        exit(1);
    }

    const recipients = fs.readFileSync(receiverFile, "utf8")
        .split("\n")
        .map(p => p.trim())
        .filter(p => p.length > 0);

    const privateKeys = fs.readFileSync(senderFile, "utf8")
        .split("\n")
        .map(p => p.trim())
        .filter(p => p.length > 0);

    const provider = new ethers.JsonRpcProvider(selectedRpc.url);
    const tokenAddress = selectedRpc.token;

    const mode = await askQuestion("Pilih mode transfer (1 = native coin, 2 = token ERC-20): ");
    if (!["1", "2"].includes(mode)) {
        console.log(chalk.red("❌ Pilihan tidak valid!"));
        exit(1);
    }

    const amountMode = await askQuestion("Transfer semua saldo? (y untuk YA, n untuk input manual): ");
    const transferAll = amountMode.toLowerCase() === "y";

    let amountInput = "0";
    if (!transferAll) {
        amountInput = await askQuestion("Masukkan jumlah yang akan dikirim (misal: 0.005): ");
    }

    console.log(chalk.yellow(`\n🚀 Chain: ${selectedRpc.name} | Mode: ${mode === "1" ? "Native Coin" : "Token ERC-20"} | Transfer: ${transferAll ? "ALL" : amountInput}\n`));

    let tokenInfo;
    if (mode === "2") {
        tokenInfo = await getTokenInfo(provider, tokenAddress);
    }

    for (let i = 0; i < privateKeys.length; i++) {
        console.log(chalk.cyanBright(`👩‍💻 [${i + 1}] Memproses wallet ke-${i + 1}...`));
        const rawKey = privateKeys[i];
        let senderWallet;

        try {
            senderWallet = new ethers.Wallet(rawKey, provider);
        } catch (error) {
            console.log(chalk.red(`❌   Gagal inisialisasi wallet: ${error.message}`));
            continue;
        }

        console.log(chalk.blueBright(`👛   Alamat: ${senderWallet.address}`));

        if (mode === "2") {
            const tokenContract = new ethers.Contract(tokenAddress, erc20Abi, senderWallet);
            try {
                const balance = await tokenContract.balanceOf(senderWallet.address);
                const rawAmount = transferAll
                    ? balance
                    : ethers.parseUnits(amountInput, tokenInfo.decimals);

                console.log(chalk.greenBright(`💰 Saldo token: ${ethers.formatUnits(balance, tokenInfo.decimals)} ${tokenInfo.symbol}`));

                if (balance < rawAmount) {
                    console.log(chalk.red(`❌   Saldo token tidak cukup.`));
                    continue;
                }

                for (let j = 0; j < recipients.length; j++) {
                    const recipient = recipients[j];
                    console.log(chalk.blueBright(`➡️   Mengirim ke ${recipient}...`));
                    try {
                        const tx = await tokenContract.transfer(recipient, rawAmount);
                        console.log(chalk.green(`✅   TX Hash: ${tx.hash}`));
                        await tx.wait();
                    } catch (err) {
                        console.log(chalk.red(`❌   Gagal: ${err.message}`));
                    }

                    console.log(chalk.gray(`⏳ Tunggu 3 detik...\n`));
                    await new Promise(r => setTimeout(r, 3000));
                }
            } catch (err) {
                console.log(chalk.red(`❌   Gagal memproses token: ${err.message}`));
            }
        } else {
            try {
                const balance = await provider.getBalance(senderWallet.address);
                const gasPrice = await provider.getGasPrice();
                const gasLimit = 21000n;
                const gasCost = gasPrice * gasLimit;

                if (balance <= gasCost) {
                    console.log(chalk.red(`❌   Tidak cukup untuk bayar gas.`));
                    continue;
                }

                const rawAmount = transferAll
                    ? balance - gasCost
                    : ethers.parseEther(amountInput);

                if (!transferAll && balance < rawAmount + gasCost) {
                    console.log(chalk.red(`❌   Saldo tidak cukup termasuk gas.`));
                    continue;
                }

                console.log(chalk.greenBright(`💰 Saldo native: ${ethers.formatEther(balance)} ${selectedRpc.name}`));

                for (let j = 0; j < recipients.length; j++) {
                    const recipient = recipients[j];
                    console.log(chalk.blueBright(`➡️   Kirim ke ${recipient}...`));
                    try {
                        const tx = await senderWallet.sendTransaction({
                            to: recipient,
                            value: rawAmount,
                            gasPrice,
                            gasLimit
                        });
                        console.log(chalk.green(`✅   TX Hash: ${tx.hash}`));
                        await tx.wait();
                    } catch (err) {
                        console.log(chalk.red(`❌   Gagal: ${err.message}`));
                    }

                    console.log(chalk.gray(`⏳ Tunggu 3 detik...\n`));
                    await new Promise(r => setTimeout(r, 3000));
                }
            } catch (err) {
                console.log(chalk.red(`❌   Gagal ambil saldo: ${err.message}`));
            }
        }
    }

    console.log(chalk.greenBright("\n🎉 Semua wallet selesai diproses!\n"));
}

// Fungsi utama start
async function start() {
    showBanner();
    const rpcList = getRpcList();

    if (rpcList.length === 0) {
        console.log(chalk.red("❌ Tidak ada RPC ditemukan di .env!"));
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
