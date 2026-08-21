{
  description = "DeepSeek Harness with the tested Fabric and Fovea closure";

  inputs.nixpkgs.url = "github:NixOS/nixpkgs/nixos-unstable";

  outputs = { self, nixpkgs }:
    let
      systems = [ "x86_64-linux" "aarch64-linux" "x86_64-darwin" "aarch64-darwin" ];
      forAllSystems = nixpkgs.lib.genAttrs systems;
    in {
      packages = forAllSystems (system:
        let
          pkgs = import nixpkgs { inherit system; };
          version = (builtins.fromJSON (builtins.readFile ./apps/cli/package.json)).version;
          dsh = pkgs.writeShellApplication {
            name = "dsh";
            runtimeInputs = [ pkgs.nodejs_22 ];
            text = ''
              export DSH_INSTALL_CHANNEL=nix
              exec npx --yes @monotykamary/dsh@${version} "$@"
            '';
          };
        in { default = dsh; inherit dsh; });

      apps = forAllSystems (system: {
        default = { type = "app"; program = "${self.packages.${system}.dsh}/bin/dsh"; };
        dsh = { type = "app"; program = "${self.packages.${system}.dsh}/bin/dsh"; };
      });
    };
}
