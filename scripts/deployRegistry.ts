import { toNano } from '@ton/core';
import { DIDRegistry } from '../build/Registry/Registry_DIDRegistry';
import { NetworkProvider } from '@ton/blueprint';

export async function run(provider: NetworkProvider) {
    console.log('🔨 Deploying DID Registry contract...');

    // Create contract instance
    const didRegistry = provider.open(await DIDRegistry.fromInit());

    // Deploy the contract
    console.log('🚀 Deploying DID Registry to testnet...');

    const deployResult = await didRegistry.send(
        provider.sender(),
        {
            value: toNano('0.1'), // Deployment fee
        },
        null
    );

    await provider.waitForDeploy(didRegistry.address);

    const contractAddress = didRegistry.address;
    console.log('✅ DID Registry deployed successfully!');
    console.log('📄 Contract address:', contractAddress.toString());
    console.log('🔗 View on testnet:', `https://testnet.tonscan.org/address/${contractAddress.toString()}`);

    // Test basic functionality
    console.log('\n🧪 Testing contract functionality...');

    const totalDIDs = await didRegistry.getTotalDIDs();
    console.log('📊 Total DIDs registered:', totalDIDs);

    const contractOwner = await didRegistry.getContractOwner();
    console.log('👤 Contract owner:', contractOwner.toString());

    const senderAddress = provider.sender().address;
    if (senderAddress) {
        const isActive = await didRegistry.isDIDActive(senderAddress);
        console.log('❓ Deployer has active DID:', isActive);

        const userNonce = await didRegistry.getUserNonce(senderAddress);
        console.log('🔢 Deployer current nonce:', userNonce);
    }

    console.log('\n🎉 Deployment completed successfully!');
    console.log('💡 You can now register DIDs using this contract address');
    console.log('📚 Available operations:');
    console.log('   - RegisterDID: Register a new decentralized identity');
    console.log('   - UpdateDID: Update existing DID information');
    console.log('   - RevokeDID: Revoke/deactivate a DID');
    console.log('   - getDID: Query DID information by address');

    return {
        contractAddress: contractAddress.toString(),
        explorerUrl: `https://testnet.tonscan.org/address/${contractAddress.toString()}`,
        success: true
    };
}