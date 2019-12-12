const sha256 = require('sha256');
const currentNodeUrl = process.argv[3];
const uuid = require('uuid/v1');

class Blockchain {
    constructor() {
        this.chain = [];
        this.pendingTransactions = [];
        this.currentNodeUrl = currentNodeUrl;
        this.networkNodes = [];
        this.createNewBlock(100, '0', '0');
    }
    
    createNewBlock(nonce, previousBlockHash, hash) {
        const newBlock = {
            index: this.chain.length + 1,
            timestamp: Date.now(),
            transactions: this.pendingTransactions,
            nonce: nonce,
            hash: hash,
            previousBlockHash: previousBlockHash
        };
        this.pendingTransactions = [];
        this.chain[this.chain.length] = newBlock;
        return newBlock;
    }

    getLastBlock() {
        return this.chain.slice(-1)[0];
    }

    createNewTransaction(amount, sender, recipient) {
        const newTransaction = {
            amount: amount,
            sender: sender,
            recipient: recipient,
            transactionId: uuid().split('-').join('')
        };
        return newTransaction;
    }

    addTransactionToPendingTransactions(transactionObj) {
        this.pendingTransactions[this.pendingTransactions.length] = transactionObj;
        return this.getLastBlock().index + 1;
    }

    hashBlock(previousBlockHash, currentBlockData, nonce) {
        const dataAsString = previousBlockHash + nonce.toString() + JSON.stringify(currentBlockData);
        const hash = sha256(dataAsString);
        return hash;
    }

    proofOfWork(previousBlockHash, currentBlockData) {
        let nonce = 0;
        let hash = this.hashBlock(previousBlockHash, currentBlockData, nonce);
    
        do {
            ++nonce;
            hash = this.hashBlock(previousBlockHash, currentBlockData, nonce);
        }
        while (hash.slice(0, 4) !== '0000')

        return nonce;
    }

    chainIsValid(blockchain) {
        let legitChain = true;
        let iterator = 1;

        while(iterator < blockchain.length) {
            const presentBlock = blockchain[i];
            const prevBlock = blockchain[i - 1];
            const blockHash = this.hashBlock(prevBlock.hash, { transactions: presentBlock.transactions, index: presentBlock.index }, presentBlock.nonce);
            
            if (blockHash.slice(0, 4) !== '0000' || presentBlock.lastBlockHash !== prevBlock.hash)
                legitChain = false;

            ++iterator;
        };

        const genesisBlock = blockchain[0];
        const validNonce = genesisBlock.nonce === 100;
        const validLastBlockHash = genesisBlock.lastBlockHash === '0';
        const validHash = genesisBlock.hash === '0';
        const validTransactions = genesisBlock.transactions.length === 0;
        if (!validNonce || !validLastBlockHash || !validHash || !validTransactions)
            legitChain = false;
        return legitChain;
    }

    getBlock(blockHash) {
        let correctBlock = null;
        this.chain.forEach(block => {
            if (block.hash === blockHash)
                correctBlock = block;
        });
        return correctBlock;
    }

    getTransaction(transactionId) {
        let correctTransaction = null;
        let correctBlock = null;
        this.chain.forEach(block => {
            block.transactions.forEach(transaction => {
                if (transaction.transactionId === transactionId) {
                    correctTransaction = transaction;
                    correctBlock = block;
                }
                ;
            });
        });
        return {
            transaction: correctTransaction,
            block: correctBlock
        };
    };

    getAddressData(address) {
        const addressTransactions = [];
        this.chain.forEach(block => {
            block.transactions.forEach(transaction => {
                if (transaction.sender === address || transaction.recipient === address) {
                    addressTransactions[addressTransactions.length] = transaction;
                };
            });
        });
        let balance = 0;
        addressTransactions.forEach(transaction => {
            if (transaction.recipient === address)
                balance += transaction.amount;
            else if (transaction.sender === address)
                balance -= transaction.amount;
        });
        return {
            addressTransactions: addressTransactions,
            addressBalance: balance
        };
    };
};

module.exports = Blockchain;