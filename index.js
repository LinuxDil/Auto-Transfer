import { ethers } from "ethers";
import dotenv from "dotenv";
import fs from "fs";
import chalk from "chalk";
import { exit } from "process";
dotenv.config();

// Fungsi untuk membaca list RPC
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

// Fungsi untuk banner
function showBanner() {
    console.clear();
    console.log(chalk.magentaBright(`
========================================
  AUTO TRANSFER NATIVE / TOKEN ERC-20
========================================
`));
}

// Fungsi untuk input dari user
async function askQuestion(query) {
    process.stdout.write(chalk.yellow(query));
    return new Promise(resolve => {
        process.stdin.once("data", data => resolve(data.toString().trim()));
    });
}

// Fungsi utama
async function autoTransfer(selectedRpc) {
    const receiverFile = "addresspenerima.txt";
    const senderFile = "walletpengirim.txt";

    if (!fs.existsSync(receiverFile) || !fs.existsSync(senderFile)) {
        console.log(chalk.red(`❌ File '${receiverFile}' atau '${senderFile}' tidak ditemukan.`));
        exit(1);
    }

    const recipients = fs.readFileSync(receiverFile, "utf8")
        .split("\n").map(p => p.trim()).filter(p => p);

    const privateKeys = fs.readFileSync(senderFile, "utf8")
        .split("\n").map(p => p.trim()).filter(p => p);

    const provider = new ethers.JsonRpcProvider(selectedRpc.url);

    const mode = await askQuestion("Pilih mode transfer (1 = native coin, 2 = token ERC-20): ");

    if (!["1", "2"].includes(mode)) {
        console.log(chalk.red("❌ Pilihan tidak valid!"));
        exit(1);
    }

    let transferAll = false;
    let amount = 0n;
    if (mode === "1") {
        const allInput = await askQuestion("Transfer semua saldo? (y untuk YA, n untuk input manual): ");
        transferAll = allInput.toLowerCase() === "y";
        if (!transferAll) {
            const amountInput = await askQuestion("Masukkan jumlah yang akan dikirim (misal: 0.005): ");
            amount = ethers.parseEther(amountInput);
        }
    }

    console.log(chalk.yellow(`\n🚀 Chain: ${selectedRpc.name} | Mode: ${mode === "1" ? "Native Coin" : "Token ERC-20"} | Transfer: ${transferAll ? "ALL" : ethers.formatEther(amount)}\n`));

    for (let i = 0; i < privateKeys.length; i++) {
        console.log(chalk.cyanBright(`👩‍💻 [${i + 1}] Memproses wallet ke-${i + 1}...`));

        let wallet;
        try {
            wallet = new ethers.Wallet(privateKeys[i], provider);
        } catch (e) {
            console.log(chalk.red(`❌ Gagal inisialisasi wallet: ${e.message}`));
            continue;
        }

        console.log(chalk.blue(`👛   Alamat: ${wallet.address}`));

        if (mode === "1") {
            try {
                const balance = await provider.getBalance(wallet.address);
                const feeData = await provider.getFeeData();
                const gasPrice = feeData.gasPrice ?? ethers.parseUnits("5", "gwei");
                const gasLimit = BigInt(21000); // Standar untuk transfer native

                const gasFee = gasPrice * gasLimit;

                let sendAmount = transferAll ? balance - gasFee : amount;

                if (sendAmount <= 0n) {
                    console.log(chalk.red("❌ Saldo tidak cukup setelah dikurangi gas fee."));
                    continue;
                }

                for (let j = 0; j < recipients.length; j++) {
                    const recipient = recipients[j];
                    console.log(chalk.blue(`➡️  Kirim ke ${recipient}...`));

                    try {
                        const tx = await wallet.sendTransaction({
                            to: recipient,
                            value: sendAmount,
                            gasLimit: gasLimit,
                            gasPrice: gasPrice,
                        });
                        console.log(chalk.green(`✅ TX terkirim: ${tx.hash}`));
                        await tx.wait();
                    } catch (e) {
                        console.log(chalk.red(`❌ Gagal kirim: ${e.message}`));
                    }

                    console.log(chalk.gray("⏳ Tunggu 3 detik...\n"));
                    await new Promise(r => setTimeout(r, 3000));
                }
            } catch (e) {
                console.log(chalk.red(`❌ Gagal transfer native: ${e.message}`));
            }
        } else {
            console.log(chalk.red("❌ Mode token belum diimplementasikan di script ini."));
        }
    }

    console.log(chalk.greenBright("\n🎉 Semua akun telah diproses!\n"));
}

// START
async function start() {
    showBanner();
    const rpcList = getRpcList();

    if (rpcList.length === 0) {
        console.log(chalk.red("❌ Tidak ada RPC yang ditemukan di .env!"));
        exit(1);
    }

    console.log(chalk.cyan("📜 Daftar Chain:"));
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
