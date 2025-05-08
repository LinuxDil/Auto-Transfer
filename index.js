import { ethers } from "ethers";
import dotenv from "dotenv";
import fs from "fs";
import chalk from "chalk";
import figlet from 'figlet';
import { exit } from "process";
dotenv.config();

// Ambil semua RPC dari env
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

// Fungsi untuk menampilkan banner
function showBanner() {
  figlet.text('TRANSFER', {
    font: 'Standard', // kamu bisa ganti dengan font lain seperti 'Slant', 'Big', dll
    horizontalLayout: 'default',
    verticalLayout: 'default'
  }, (err, data) => {
    if (err) {
      console.error('Something went wrong with figlet...');
      console.error(err);
      return;
    }

    console.clear();
    console.log(chalk.greenBright(data));
    console.log(chalk.greenBright('========================================'));
    console.log(chalk.greenBright('                           [by WIN]'));
    console.log(chalk.greenBright('========================================'));
  });
}

// Jalankan fungsi
showBanner();

// Input dari user
async function askQuestion(query) {
    process.stdout.write(chalk.yellow(query));
    return new Promise(resolve => {
        process.stdin.once("data", data => resolve(data.toString().trim()));
    });
}

// Ambil info token: decimals + symbol
async function getTokenInfo(provider, tokenAddress) {
    const tokenContract = new ethers.Contract(tokenAddress, erc20Abi, provider);
    const decimals = await tokenContract.decimals();
    const symbol = await tokenContract.symbol();
    return { decimals, symbol };
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
        .split("\n")
        .map(p => p.trim())
        .filter(p => p.length > 0);

    const privateKeys = fs.readFileSync(senderFile, "utf8")
        .split("\n")
        .map(p => p.trim())
        .filter(p => p.length > 0);

    const provider = new ethers.JsonRpcProvider(selectedRpc.url);
    const tokenAddress = selectedRpc.token;

    const mode = await askQuestion(
        "Pilih mode transfer! (angka (1) untuk native Token, angka (2) untuk Token ERC-20): "
    );

    if (!["1", "2"].includes(mode)) {
        console.log(chalk.red("❌ Pilihan tidak valid!"));
        exit(1);
    }

    const transferAll = await askQuestion("Transfer semua saldo? (huruf (y) untuk YA, huruf (n) untuk input manual): ");
    let amountInput;

    if (transferAll.toLowerCase() === "y") {
        amountInput = "ALL";
    } else {
        amountInput = await askQuestion("Masukkan jumlah yang akan dikirim (contoh: 0.005): ");
    }

    console.log(chalk.yellow(`\n🚀 Chain: ${selectedRpc.name} | Mode: ${mode === "1" ? "Native Token" : "Token ERC-20"} | Jumlah: ${amountInput}\n`));

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
            console.log(chalk.red(`❌   Gagal inisialisasi wallet ke-${i + 1}: ${error.message}`));
            continue;
        }

        console.log(chalk.blueBright(`👩‍💻   Alamat: ${senderWallet.address} (Wallet ke-${i + 1})`));

        // Menampilkan saldo sebelum transfer
        if (mode === "2") {
            const tokenContract = new ethers.Contract(tokenAddress, erc20Abi, senderWallet);
            try {
                const balance = await tokenContract.balanceOf(senderWallet.address);
                console.log(chalk.greenBright(`✅   Saldo token: ${ethers.formatUnits(balance, tokenInfo.decimals)} ${tokenInfo.symbol}`));
            } catch (err) {
                console.log(chalk.red(`❌   Gagal mengambil saldo token: ${err.message}`));
                continue;
            }
        } else {
            const balance = await provider.getBalance(senderWallet.address);
            console.log(chalk.greenBright(`✅   Saldo native: ${ethers.formatEther(balance)} ${selectedRpc.name}`));
        }

        if (mode === "2") {
            const tokenContract = new ethers.Contract(tokenAddress, erc20Abi, senderWallet);
            try {
                let rawAmount;
                if (amountInput === "ALL") {
                    const balance = await tokenContract.balanceOf(senderWallet.address);
                    rawAmount = balance;
                } else {
                    rawAmount = ethers.parseUnits(amountInput, tokenInfo.decimals);
                }

                const balance = await tokenContract.balanceOf(senderWallet.address);

                if (balance < rawAmount) {
                    console.log(chalk.red(`❌   Wallet tidak cukup saldo token (${ethers.formatUnits(balance, tokenInfo.decimals)} ${tokenInfo.symbol})`));
                    continue;
                }

                for (let j = 0; j < recipients.length; j++) {
                    const recipient = recipients[j];
                    console.log(chalk.blueBright(`👩‍💻   [${i + 1}.${j + 1}] Kirim ke penerima ke-${j + 1}: ${recipient}`));

                    try {
                        const tx = await tokenContract.transfer(recipient, rawAmount);
                        console.log(chalk.green(`✅   Mengirim ${amountInput} ${tokenInfo.symbol} ke ${recipient}`));
                        console.log(chalk.green(`✅   TX Hash: ${tx.hash}`));
                        await tx.wait();

                        const recipientBalance = await tokenContract.balanceOf(recipient);
                        console.log(chalk.green(`✅   Saldo penerima (${recipient}): ${ethers.formatUnits(recipientBalance, tokenInfo.decimals)} ${tokenInfo.symbol}`));
                    } catch (err) {
                        console.log(chalk.red(`❌   Gagal kirim token ke ${recipient}: ${err.message}`));
                    }

                    console.log(chalk.gray(`⏳   Tunggu 3 detik sebelum lanjut...\n`));
                    await new Promise(r => setTimeout(r, 3000));
                }
            } catch (err) {
                console.log(chalk.red(`❌   Gagal memproses token: ${err.message}`));
            }
        } else {
            try {
                const balance = await provider.getBalance(senderWallet.address);
                console.log(chalk.greenBright(`✅   Saldo native: ${ethers.formatEther(balance)} ${selectedRpc.name}`));

                let rawAmount;
                if (amountInput === "ALL") {
                    rawAmount = balance;
                } else {
                    rawAmount = ethers.parseEther(amountInput);
                }

                if (balance < rawAmount) {
                    console.log(chalk.red(`❌   Wallet tidak cukup saldo native (${ethers.formatEther(balance)})`));
                    continue;
                }

                for (let j = 0; j < recipients.length; j++) {
                    const recipient = recipients[j];
                    console.log(chalk.blueBright(`👩‍💻   [${i + 1}.${j + 1}] Kirim ke penerima ke-${j + 1}: ${recipient}`));

                    try {
                        const tx = await senderWallet.sendTransaction({
                            to: recipient,
                            value: rawAmount
                        });
                        console.log(chalk.green(`✅   Mengirim ${amountInput} native Token ke ${recipient}`));
                        console.log(chalk.green(`✅   TX Hash: ${tx.hash}`));
                        await tx.wait();

                        const recipientBalance = await provider.getBalance(recipient);
                        console.log(chalk.green(`✅   Saldo penerima (${recipient}): ${ethers.formatEther(recipientBalance)} ${selectedRpc.name}`));
                    } catch (err) {
                        console.log(chalk.red(`❌   Gagal kirim native Token ke ${recipient}: ${err.message}`));
                    }

                    console.log(chalk.gray(`⏳   Tunggu 3 detik sebelum lanjut...\n`));
                    await new Promise(r => setTimeout(r, 3000));
                }
            } catch (err) {
                console.log(chalk.red(`❌   Gagal ambil saldo native: ${err.message}`));
            }
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

    console.log("Daftar Chain Mainnet/Testnet:");
    rpcList.forEach((rpc, index) => {
        console.log(`${index + 1}. ${rpc.name}`);
    });

    const selectedIndex = await askQuestion("Pilih CHAIN yang akan diproses (masukkan nomor): ");
    const selectedRpc = rpcList[Number(selectedIndex) - 1];

    if (!selectedRpc) {
        console.log(chalk.red("❌ Pilihan tidak valid!"));
        exit(1);
    }

    console.log(chalk.green(`\n✅ Kamu memilih: ${selectedRpc.name}\n`));
    await autoTransfer(selectedRpc);
}

start();
