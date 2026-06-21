import { audioRouter } from '../electron/audio-router';

async function test() {
  console.log('\n🎵 Testing Audio Device Detection\n');

  try {
    const devices = await audioRouter.detectDevices();
    console.log(`Found ${devices.length} audio devices\n`);

    audioRouter.printDevices();

    const btDevices = audioRouter.getBluetoothDevices();
    if (btDevices.length > 0) {
      console.log(`\n✓ Bluetooth device(s) detected: ${btDevices.map((d) => d.name).join(', ')}`);
      console.log(`  → This will be used for voice input/output by default\n`);
    } else {
      console.log('\n⚠ No Bluetooth devices found');
      console.log('  → Will fall back to Mac built-in speakers/mic\n');
    }

    console.log('Test completed successfully! ✓\n');
  } catch (error) {
    console.error(`\n✗ Error: ${(error as Error).message}\n`);
    process.exit(1);
  }
}

test();
