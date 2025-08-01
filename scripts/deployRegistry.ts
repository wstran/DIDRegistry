import { toNano } from '@ton/core';
import { DIDRegistry } from '../wrappers/DIDRegistry';
import { NetworkProvider } from '@ton/blueprint';
import { compile } from '@tact-lang/compiler';
import { readFileSync } from 'fs';
import { join } from 'path';

export async function run(provider: NetworkProvider) {
    // Compile the contract
    console.log('🔨 Compiling DID Registry contract...');

    const tactConfig = JSON.parse(readFileSync(join(__dirname, '../tact.config.json'), 'utf8'));
    const projectConfig = tactConfig.projects[0];

    const result = await compile({
        ...projectConfig,
        path: join(__dirname, '../contracts/did_registry.tact')
    });

    if (!result.ok) {
        console.error('❌ Compilation failed:', result.error);
        return;
    }

    console.log('✅ Contract compiled successfully');

    // Create contract instance
    const didRegistry = DIDRegistry.createFromConfig({}, result.code!);

    // Deploy the contract
    console.log('🚀 Deploying DID Registry to testnet...');

    await provider.deploy(didRegistry, toNano('0.05'));

    const contractAddress = didRegistry.address;
    console.log('✅ DID Registry deployed successfully!');
    console.log('📄 Contract address:', contractAddress.toString());
    console.log('🔗 View on testnet:', `https://testnet.tonscan.org/address/${contractAddress.toString()}`);

    // Test basic functionality
    console.log('\n🧪 Testing contract functionality...');

    const isActive = await didRegistry.isDIDActive(provider.provider(), provider.sender().address!);
    console.log('❓ Sender has active DID:', isActive);

    const totalDIDs = await didRegistry.getTotalDIDs(provider.provider());
    console.log('📊 Total DIDs registered:', totalDIDs);

    console.log('\n🎉 Deployment completed successfully!');
    console.log('💡 You can now register DIDs using this contract address');

    return {
        contractAddress: contractAddress.toString(),
        explorerUrl: `https://testnet.tonscan.org/address/${contractAddress.toString()}`
    };
}